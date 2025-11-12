const express = require('express');
const request = require('request');
const zlib = require('zlib');
const cors = require('cors');
const app = express();

let PROXY_PORT = process.env.port || 4006;

if (process.argv.includes('--port')) {
  PROXY_PORT = process.argv[process.argv.indexOf('--port') + 1];
} else if (process.argv.includes('-p')) {
  PROXY_PORT = process.argv[process.argv.indexOf('-p') + 1];
}

const ATTR_PATTERN =
/\b(?:src|href|action|data|poster|formaction|background|code|archive|manifest)\s*=\s*(['"])(?!https?:|\/\/|#|data:|mailto:|tel:|javascript:)([^'"]+)\1/gi;

const CSS_URL_PATTERN =
/url\(\s*(['"]?)(?!https?:|\/\/|data:|#)([^'")]+)\1\s*\)/gi;

const SVG_PATTERN =
/(?:xlink:href|href)\s*=\s*(['"])(?!https?:|\/\/|#|data:)([^'"]+)\1|url\(\s*#([^'")]+)\s*\)/gi;

const META_REFRESH_PATTERN =
/<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^"']*url=([^'">]+)["'][^>]*>/gi;

const CSS_IMPORT_PATTERN =
/@import\s+(?:url\()?['"]?(?!https?:|\/\/|data:)([^'")]+)['"]?\)?/gi;


app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function safeSetHeaders(res, headers) {
  try {
    delete headers['content-length'];
    delete headers['x-frame-options'];
    delete headers['content-security-policy'];
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

function makeRequestOptions(req, res) {
  if (!req.query.url) {
    res.status(400).send('Missing ?url=')
    return;
  }

  const targetUrl = decodeURIComponent(Array.isArray(req.query.url) ? req.query.url[0] : req.query.url);
  const queryParams = { ...req.query };
  delete queryParams.url;

  const useCookies = queryParams.useCookies;
  if (useCookies) delete queryParams.useCookies;
  
  const userAgent = queryParams.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';
  if (userAgent) delete queryParams.userAgent;

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

  _url = (new URL(targetUrl))
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
    'accept-language': '*',
    'upgrade-insecure-requests': '0'
  }

  if(!useCookies && headers.cookie) delete headers.cookie;

  const qs = Object.keys(queryParams).length
    ? '?' + Object.entries(queryParams).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
    : '';

  const options = {
    url: targetUrl,
    qs,
    method: req.method,
    headers,
    rejectUnauthorized: false,
    encoding: null,
    timeout: 20000
  };

  return options
}

app.use('/proxy', (req, res) => {
  const options = makeRequestOptions(req, res);
  if(!options) return;

  request(options, (err, response, body) => {
    if (err || !response) {
      console.error('[proxy] request error', err);
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
      }

      safeSetHeaders(res, response.headers);

      const ct = (response.headers['content-type'] || '').toLowerCase();
      if (ct.includes('text/html')) {
        let html = body.toString('utf8');

        const polyfill = `
<script>
try {
  if (!Element.prototype.replaceChildren) {
    Element.prototype.replaceChildren = function(...nodes) {
      while (this.firstChild) this.removeChild(this.firstChild);
      if (nodes && nodes.length) this.append(...nodes);
    };
  }
} catch (e) { console.warn('polyfill failed', e); }
 // ---- FETCH INTERCEPT ----
const _fetch = globalThis.fetch;

globalThis.fetch = async (...args) => {
  console.log("A Fetch was been made");
  try {
    const response = await _fetch(...args);
    return response;
  } catch (error) {
    console.error("Fetch failed:", error);
    throw error;
  }
};

// ---- XHR INTERCEPT ----
(function() {
  const _open = XMLHttpRequest.prototype.open;
  const _send = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._url = url;  // store for later reference
    this._method = method;
    return _open.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function(...args) {
    console.log(\`An XHR was been made (${this._method} → ${this._url})\`);
    return _send.apply(this, args);
  };
})();

</script>`;
        html = html.replace(/<head([^>]*)>/i, `<head$1>${polyfill}`);

        html = rewriteLocalPaths(html, options.url, req);

        body = Buffer.from(html, 'utf8');
      }

      res.status(response.statusCode || 200).send(body);
    } catch (ex) {
      console.error('[proxy] processing error', ex);
      res.status(500).send('Proxy internal error');
    }
  }).on('error', (e) => {
    console.error('[proxy] stream error', e);
  });
});

app.get('/browser', async (req, res) => {
  const options = makeRequestOptions(req, res);
  if(!options) return;

  try {
    request(options, (rErr, rResp, rBody) => {
      if (rErr || !rResp) {
        console.warn('[browser] fallback failed', rErr);
        return res.status(502).send('Browser rendering failed');
      }
      const ce = (rResp.headers['content-encoding'] || '').toLowerCase();
      if (ce === 'gzip') rBody = zlib.gunzipSync(rBody);
      else if (ce === 'deflate') rBody = zlib.inflateSync(rBody);

      const ct = (rResp.headers['content-type'] || '').toLowerCase();
      if (ct.includes('text/html')) {
        let html = rBody.toString('utf8');
        const poly = `<script>if(!Element.prototype.replaceChildren){Element.prototype.replaceChildren=function(...n){while(this.firstChild)this.removeChild(this.firstChild);if(n.length)this.append(...n)}};</script>`;
        html = html.replace(/<head([^>]*)>/i, `<head$1>${poly}`);
        html = rewriteLocalPaths(html, options.url, req);
        rBody = Buffer.from(html, 'utf8');
      }
      safeSetHeaders(res, rResp.headers);
      res.status(rResp.statusCode || 200).send(rBody);
    });
  } catch (err) {
    console.error('[browser] fallback failed', err);
    res.status(502).send('Browser rendering failed');
  }
});


app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));
app.use((err, req, res, next) => {
  console.error('[express] uncaught', err);
  if (!res.headersSent) res.status(500).send('Internal Error');
});

app.listen(PROXY_PORT, '0.0.0.0', () =>
  console.log(`✅ Proxy server running on port ${PROXY_PORT}`)
);
