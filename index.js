const express = require('express');
const request = require('request');
const zlib = require('zlib');
const cors = require('cors');
const axios = require('axios');
const app = express();

let PROXY_PORT = process.env.port || 4006;

if (process.argv.includes('--port')) {
  PROXY_PORT = process.argv[process.argv.indexOf('--port') + 1];
} else if (process.argv.includes('-p')) {
  PROXY_PORT = process.argv[process.argv.indexOf('-p') + 1];
}

const ATTR_PATTERN =
/\b(?:src|href|action|data|poster|formaction|background|code|archive|manifest)\s*=\s*(['"])(?!https?:\/\/|\/\/|#|data:|mailto:|tel:|javascript:)([^'"]+)\1/gi;

const CSS_URL_PATTERN =
/url\(\s*(['"]?)(?!https?:\/\/|\/\/|data:|#)([^'")]+)\1\s*\)/gi;

const SVG_PATTERN =
/(?:xlink:href|href)\s*=\s*(['"])(?!https?:\/\/|\/\/|#|data:)([^'"]+)\1|url\(\s*#([^'")]+)\s*\)/gi;

const META_REFRESH_PATTERN =
/<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^"']*url=([^'">]+)["'][^>]*>/gi;

const CSS_IMPORT_PATTERN =
/@import\s+(?:url\()?['"]?(?!https?:\/\/|\/\/|data:)([^'")]+)['"]?\)?/gi;

const SRCSET_PATTERN = 
/(srcset\s*=\s*['"])([^'"]+)(['"])/gi;

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Store logs in memory (last 1000 entries)
const requestLogs = [];
const MAX_LOGS = 1000;

function addLog(type, url, status, details = {}) {
  const log = {
    timestamp: new Date().toISOString(),
    type,
    url,
    status,
    ...details
  };
  requestLogs.unshift(log);
  if (requestLogs.length > MAX_LOGS) {
    requestLogs.pop();
  }
}

function safeSetHeaders(res, headers) {
  try {
    delete headers['content-length'];
    delete headers['x-frame-options'];
    delete headers['content-security-policy'];
    delete headers['content-security-policy-report-only'];
    delete headers['x-content-security-policy'];
    delete headers['strict-transport-security'];
    res.set(headers);
  } catch (e) {
    console.error('[safeSetHeaders]', e);
  }
}

function rewriteLocalPaths(html, baseUrl, req) {
  if (!html || typeof html !== 'string' || !baseUrl) return html;

  try {
    const base = new URL(baseUrl);
    const cleanBase = base.href.split('#')[0].split('?')[0];
    const proxyOrigin = `${req.protocol}://${req.headers.host}`;

    if (!/<base\s/i.test(html)) {
      html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${cleanBase}">`);
    }

    const isAbsoluteOrSkip = (url) => {
      if (!url) return true;
      return /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|data:|mailto:|tel:|javascript:)/i.test(url.trim());
    };

    const resolveToProxied = (url) => {
      try {
        const resolved = new URL(url, cleanBase).href;
        const pathName = req?._parsedUrl?.pathname || '/proxy';
        return `${proxyOrigin}${pathName}?url=${encodeURIComponent(resolved)}`;
      } catch {
        return url;
      }
    };

    // Rewrite srcset attributes
    html = html.replace(SRCSET_PATTERN, (match, prefix, srcsetValue, suffix) => {
      const sources = srcsetValue.split(',').map(src => {
        const parts = src.trim().split(/\s+/);
        const url = parts[0];
        const descriptor = parts.slice(1).join(' ');
        if (!isAbsoluteOrSkip(url)) {
          return `${resolveToProxied(url)} ${descriptor}`.trim();
        }
        return src.trim();
      });
      return `${prefix}${sources.join(', ')}${suffix}`;
    });

    html = html
      .replace(ATTR_PATTERN, (m, quote, val) => {
        if (!val || isAbsoluteOrSkip(val)) return m;
        return m.replace(val, resolveToProxied(val));
      })

      .replace(CSS_URL_PATTERN, (m, quote, val) => {
        if (!val || isAbsoluteOrSkip(val)) return m;
        const q = quote || '';
        return `url(${q}${resolveToProxied(val)}${q})`;
      })

      .replace(SVG_PATTERN, (m, g1, val1, val2) => {
        const target = val1 || val2;
        if (!target || isAbsoluteOrSkip(target)) return m;
        return m.replace(target, resolveToProxied(target));
      })

      .replace(META_REFRESH_PATTERN, (m, contentUrl) => {
        if (!contentUrl || isAbsoluteOrSkip(contentUrl)) return m;
        return m.replace(contentUrl, resolveToProxied(contentUrl));
      })

      .replace(CSS_IMPORT_PATTERN, (m, val) => {
        if (!val || isAbsoluteOrSkip(val)) return m;
        return m.replace(val, resolveToProxied(val));
      });

  } catch (e) {
    console.error('[rewriteLocalPaths]', e);
  }

  return html;
}

async function fetchViaFlareSolverr(flareSolverrUrl, targetUrl, maxTimeout = 60000) {
  try {
    console.log(`[FlareSolverr] Requesting: ${targetUrl}`);
    addLog('flaresolverr', targetUrl, 'pending', { flareSolverrUrl });

    const response = await axios.post(flareSolverrUrl, {
      cmd: 'request.get',
      url: targetUrl,
      maxTimeout: maxTimeout
    }, {
      timeout: maxTimeout + 5000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (response.data && response.data.solution) {
      const solution = response.data.solution;
      addLog('flaresolverr', targetUrl, 'success', { 
        status: solution.status,
        cookies: solution.cookies?.length || 0
      });
      return {
        success: true,
        html: solution.response,
        cookies: solution.cookies || [],
        userAgent: solution.userAgent,
        status: solution.status || 200,
        headers: solution.headers || {}
      };
    }

    addLog('flaresolverr', targetUrl, 'error', { error: 'Invalid response format' });
    return { success: false, error: 'Invalid FlareSolverr response' };
  } catch (error) {
    console.error('[FlareSolverr] Error:', error.message);
    addLog('flaresolverr', targetUrl, 'error', { error: error.message });
    return { success: false, error: error.message };
  }
}

function makeRequestOptions(req, res) {
  if (!req.query.url && !req.body?.url) {
    res.status(400).send('Missing ?url= parameter');
    return null;
  }

  const targetUrl = decodeURIComponent(
    Array.isArray(req.query.url) ? req.query.url[0] : (req.query.url || req.body?.url)
  );
  
  const queryParams = { ...req.query };
  delete queryParams.url;

  const useCookies = queryParams.useCookies;
  if (useCookies) delete queryParams.useCookies;
  
  const userAgent = queryParams.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';
  if (queryParams.userAgent) delete queryParams.userAgent;

  const forceClean = queryParams.forceClean;
  if (forceClean) {
    delete queryParams.forceClean;
    try {
      res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0'
      });
    } catch (error) {
      console.error('Error setting headers:', error);
    } 
  }

  // Extract FlareSolverr URL if provided
  const flareSolverrUrl = queryParams.flareSolverrUrl || req.body?.flareSolverrUrl;
  if (queryParams.flareSolverrUrl) delete queryParams.flareSolverrUrl;

  const _url = new URL(targetUrl);
  const headers = {
    ...req.headers,
    'host': _url.host,
    'origin': _url.origin,
    'referer': _url.origin,
    connection: 'keep-alive',
    'user-agent': userAgent,
    'upgrade-insecure-requests': '1',
    'accept': '*/*',
    'accept-encoding': '*',
    'accept-language': '*'
  };

  if (!useCookies && headers.cookie) delete headers.cookie;

  const qs = Object.keys(queryParams).length
    ? '?' + Object.entries(queryParams).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
    : '';

  const options = {
    url: targetUrl + qs,
    method: req.method,
    headers,
    rejectUnauthorized: false,
    encoding: null,
    timeout: 20000,
    flareSolverrUrl // Pass FlareSolverr URL if provided
  };

  return options;
}

function createProxyInterceptScript(proxyOrigin, pathname) {
  return `
<script>
// ============================================
// PROXY INTERCEPTION SCRIPT
// ============================================
(function() {
  'use strict';
  
  const PROXY_ORIGIN = '${proxyOrigin}';
  const PROXY_PATH = '${pathname}';
  
  // Helper: Convert URL to proxied URL
  function toProxiedUrl(url) {
    if (!url || typeof url !== 'string') return url;
    
    // Skip data URLs, blobs, and special protocols
    if (url.startsWith('data:') || url.startsWith('blob:') || 
        url.startsWith('javascript:') || url.startsWith('about:') ||
        url.startsWith('#')) {
      return url;
    }
    
    try {
      // Resolve relative URLs
      const resolved = new URL(url, window.location.href).href;
      
      // If already proxied, return as-is
      if (resolved.includes(PROXY_PATH + '?url=')) {
        return url;
      }
      
      return PROXY_ORIGIN + PROXY_PATH + '?url=' + encodeURIComponent(resolved);
    } catch (e) {
      console.warn('Failed to proxy URL:', url, e);
      return url;
    }
  }
  
  // Log helper
  function logRequest(type, url, status = 'pending') {
    console.log('[PROXY ' + type + ']', status, url);
  }
  
  // ============================================
  // 1. FETCH API INTERCEPTION
  // ============================================
  const originalFetch = window.fetch;
  window.fetch = function(resource, options = {}) {
    let url = typeof resource === 'string' ? resource : resource.url;
    const proxiedUrl = toProxiedUrl(url);
    
    logRequest('FETCH', url);
    
    if (typeof resource === 'string') {
      return originalFetch.call(this, proxiedUrl, options);
    } else {
      const newRequest = new Request(proxiedUrl, resource);
      return originalFetch.call(this, newRequest, options);
    }
  };
  
  // ============================================
  // 2. XMLHttpRequest INTERCEPTION
  // ============================================
  const XHROpen = XMLHttpRequest.prototype.open;
  const XHRSend = XMLHttpRequest.prototype.send;
  
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._proxyOriginalUrl = url;
    const proxiedUrl = toProxiedUrl(url);
    logRequest('XHR', url);
    return XHROpen.call(this, method, proxiedUrl, ...rest);
  };
  
  XMLHttpRequest.prototype.send = function(...args) {
    return XHRSend.apply(this, args);
  };
  
  // ============================================
  // 3. IMAGE LOADING INTERCEPTION
  // ============================================
  const OriginalImage = window.Image;
  window.Image = function(width, height) {
    const img = new OriginalImage(width, height);
    const originalSrcDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    
    Object.defineProperty(img, 'src', {
      get() {
        return originalSrcDescriptor.get.call(this);
      },
      set(value) {
        const proxiedUrl = toProxiedUrl(value);
        logRequest('IMG', value);
        return originalSrcDescriptor.set.call(this, proxiedUrl);
      },
      enumerable: true,
      configurable: true
    });
    
    return img;
  };
  window.Image.prototype = OriginalImage.prototype;
  
  // ============================================
  // 4. DYNAMIC SCRIPT/LINK ELEMENT INTERCEPTION
  // ============================================
  const originalCreateElement = document.createElement;
  document.createElement = function(tagName, options) {
    const element = originalCreateElement.call(document, tagName, options);
    
    if (tagName.toLowerCase() === 'script' || tagName.toLowerCase() === 'link' || 
        tagName.toLowerCase() === 'img' || tagName.toLowerCase() === 'iframe' ||
        tagName.toLowerCase() === 'video' || tagName.toLowerCase() === 'audio' ||
        tagName.toLowerCase() === 'source' || tagName.toLowerCase() === 'embed' ||
        tagName.toLowerCase() === 'object') {
      
      const srcProps = ['src', 'href'];
      srcProps.forEach(prop => {
        const descriptor = Object.getOwnPropertyDescriptor(
          Object.getPrototypeOf(element), prop
        );
        
        if (descriptor && descriptor.set) {
          Object.defineProperty(element, prop, {
            get() {
              return descriptor.get.call(this);
            },
            set(value) {
              if (value && typeof value === 'string') {
                const proxiedUrl = toProxiedUrl(value);
                logRequest(tagName.toUpperCase(), value);
                return descriptor.set.call(this, proxiedUrl);
              }
              return descriptor.set.call(this, value);
            },
            enumerable: true,
            configurable: true
          });
        }
      });
    }
    
    return element;
  };
  
  // ============================================
  // 5. WEBSOCKET INTERCEPTION (PROXY TO WS ENDPOINT)
  // ============================================
  const OriginalWebSocket = window.WebSocket;
  window.WebSocket = function(url, protocols) {
    logRequest('WEBSOCKET', url);
    console.warn('[PROXY] WebSocket proxying requires special backend support:', url);
    // For now, attempt direct connection (WS proxying needs dedicated handler)
    return new OriginalWebSocket(url, protocols);
  };
  window.WebSocket.prototype = OriginalWebSocket.prototype;
  
  // ============================================
  // 6. FORM SUBMISSION INTERCEPTION
  // ============================================
  const originalFormSubmit = HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit = function() {
    if (this.action) {
      const proxiedAction = toProxiedUrl(this.action);
      logRequest('FORM', this.action);
      this.action = proxiedAction;
    }
    return originalFormSubmit.call(this);
  };
  
  // ============================================
  // 7. POLYFILLS
  // ============================================
  if (!Element.prototype.replaceChildren) {
    Element.prototype.replaceChildren = function(...nodes) {
      while (this.firstChild) this.removeChild(this.firstChild);
      if (nodes && nodes.length) this.append(...nodes);
    };
  }
  
  console.log('[PROXY] All request interceptions active ✓');
})();
</script>
`;
}

app.use('/proxy', async (req, res) => {
  const options = makeRequestOptions(req, res);
  if (!options) return;

  addLog('proxy', options.url, 'started');

  // Check if FlareSolverr should be used
  if (options.flareSolverrUrl) {
    try {
      const result = await fetchViaFlareSolverr(options.flareSolverrUrl, options.url);
      
      if (result.success) {
        let html = result.html;
        
        // Add proxy interception script
        const proxyOrigin = `${req.protocol}://${req.headers.host}`;
        const interceptScript = createProxyInterceptScript(proxyOrigin, '/proxy');
        html = html.replace(/<head([^>]*)>/i, `<head$1>${interceptScript}`);
        
        // Rewrite URLs
        html = rewriteLocalPaths(html, options.url, req);
        
        res.set({
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store'
        });
        
        addLog('proxy', options.url, 'success', { via: 'flaresolverr' });
        return res.status(result.status || 200).send(html);
      } else {
        addLog('proxy', options.url, 'error', { error: result.error });
        return res.status(502).send(`FlareSolverr failed: ${result.error}`);
      }
    } catch (error) {
      console.error('[FlareSolverr] Error:', error);
      addLog('proxy', options.url, 'error', { error: error.message });
      return res.status(502).send(`FlareSolverr error: ${error.message}`);
    }
  }

  // Standard proxy request
  request(options, (err, response, body) => {
    if (err || !response) {
      console.error('[proxy] request error', err);
      addLog('proxy', options.url, 'error', { error: err?.message });
      return res.status(502).send('Proxy failed');
    }

    try {
      const ce = (response.headers['content-encoding'] || '').toLowerCase();
      if (ce === 'gzip') {
        body = zlib.gunzipSync(body);
        delete response.headers['content-encoding'];
      } else if (ce === 'deflate') {
        body = zlib.inflateSync(body);
        delete response.headers['content-encoding'];
      } else if (ce === 'br') {
        try {
          body = zlib.brotliDecompressSync(body);
          delete response.headers['content-encoding'];
        } catch (brErr) {
          console.warn('[proxy] brotli decompression failed:', brErr.message);
        }
      }

      safeSetHeaders(res, response.headers);

      const ct = (response.headers['content-type'] || '').toLowerCase();
      if (ct.includes('text/html')) {
        let html = body.toString('utf8');

        // Add proxy interception script
        const proxyOrigin = `${req.protocol}://${req.headers.host}`;
        const interceptScript = createProxyInterceptScript(proxyOrigin, '/proxy');
        html = html.replace(/<head([^>]*)>/i, `<head$1>${interceptScript}`);

        html = rewriteLocalPaths(html, options.url, req);

        body = Buffer.from(html, 'utf8');
      }

      addLog('proxy', options.url, 'success', { status: response.statusCode });
      res.status(response.statusCode || 200).send(body);
    } catch (ex) {
      console.error('[proxy] processing error', ex);
      addLog('proxy', options.url, 'error', { error: ex.message });
      res.status(500).send('Proxy internal error');
    }
  }).on('error', (e) => {
    console.error('[proxy] stream error', e);
    addLog('proxy', options.url, 'error', { error: e.message });
  });
});

app.get('/browser', async (req, res) => {
  const options = makeRequestOptions(req, res);
  if (!options) return;

  addLog('browser', options.url, 'started');

  // Check if FlareSolverr should be used
  if (options.flareSolverrUrl) {
    try {
      const result = await fetchViaFlareSolverr(options.flareSolverrUrl, options.url);
      
      if (result.success) {
        let html = result.html;
        const proxyOrigin = `${req.protocol}://${req.headers.host}`;
        const interceptScript = createProxyInterceptScript(proxyOrigin, '/browser');
        html = html.replace(/<head([^>]*)>/i, `<head$1>${interceptScript}`);
        html = rewriteLocalPaths(html, options.url, req);
        
        res.set({
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store'
        });
        
        addLog('browser', options.url, 'success', { via: 'flaresolverr' });
        return res.status(result.status || 200).send(html);
      } else {
        addLog('browser', options.url, 'error', { error: result.error });
        return res.status(502).send(`FlareSolverr failed: ${result.error}`);
      }
    } catch (error) {
      console.error('[FlareSolverr] Error:', error);
      addLog('browser', options.url, 'error', { error: error.message });
      return res.status(502).send(`FlareSolverr error: ${error.message}`);
    }
  }

  try {
    request(options, (rErr, rResp, rBody) => {
      if (rErr || !rResp) {
        console.warn('[browser] fallback failed', rErr);
        addLog('browser', options.url, 'error', { error: rErr?.message });
        return res.status(502).send('Browser rendering failed');
      }
      const ce = (rResp.headers['content-encoding'] || '').toLowerCase();
      if (ce === 'gzip') rBody = zlib.gunzipSync(rBody);
      else if (ce === 'deflate') rBody = zlib.inflateSync(rBody);
      else if (ce === 'br') {
        try {
          rBody = zlib.brotliDecompressSync(rBody);
        } catch (brErr) {
          console.warn('[browser] brotli failed:', brErr.message);
        }
      }

      const ct = (rResp.headers['content-type'] || '').toLowerCase();
      if (ct.includes('text/html')) {
        let html = rBody.toString('utf8');
        const proxyOrigin = `${req.protocol}://${req.headers.host}`;
        const interceptScript = createProxyInterceptScript(proxyOrigin, '/browser');
        html = html.replace(/<head([^>]*)>/i, `<head$1>${interceptScript}`);
        html = rewriteLocalPaths(html, options.url, req);
        rBody = Buffer.from(html, 'utf8');
      }
      safeSetHeaders(res, rResp.headers);
      addLog('browser', options.url, 'success', { status: rResp.statusCode });
      res.status(rResp.statusCode || 200).send(rBody);
    });
  } catch (err) {
    console.error('[browser] fallback failed', err);
    addLog('browser', options.url, 'error', { error: err.message });
    res.status(502).send('Browser rendering failed');
  }
});

// API endpoint to get logs
app.get('/api/logs', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  res.json(requestLogs.slice(0, limit));
});

// API endpoint to clear logs
app.post('/api/logs/clear', (req, res) => {
  requestLogs.length = 0;
  res.json({ success: true, message: 'Logs cleared' });
});

app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));

app.use((err, req, res, next) => {
  console.error('[express] uncaught', err);
  if (!res.headersSent) res.status(500).send('Internal Error');
});

app.listen(PROXY_PORT, '0.0.0.0', () =>
  console.log(`✅ Proxy server running on port ${PROXY_PORT}`)
);
