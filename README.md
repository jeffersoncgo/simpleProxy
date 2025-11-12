# 🚀 Advanced Proxy Server - Enhanced Edition

A powerful, feature-rich HTTP proxy server with comprehensive request interception, FlareSolverr integration, and advanced monitoring capabilities. Built with Node.js, Express, and modern web technologies.

---

## ✨ New Features (Enhanced Version)

### 🎯 Complete Request Interception
- **ALL requests are proxied** including:
  - ✅ Fetch API calls
  - ✅ XMLHttpRequest (XHR/AJAX)
  - ✅ Image loads (img src, Image constructor)
  - ✅ Script tags (dynamic script loading)
  - ✅ Stylesheets (link tags)
  - ✅ Iframes, videos, audio
  - ✅ Form submissions
  - ✅ CSS url() references
  - ✅ SVG resources
  - ✅ Srcset attributes

### 🔥 FlareSolverr Integration
- Bypass Cloudflare and other anti-bot protections
- Easy integration via `flareSolverrUrl` parameter
- Automatic fallback to standard proxy if FlareSolverr fails
- Support for both GET and POST methods

### 📊 Advanced Monitoring Dashboard
- **Real-time request logging** with auto-refresh
- Color-coded log entries (success, error, pending)
- Request type indicators (PROXY, FLARESOLVERR, BROWSER)
- Timestamp tracking for all requests
- Sidebar panel with tabs: Logs, Headers, Info
- Clear logs functionality
- Status bar with live indicators

### 🎨 Modern User Interface
- Beautiful gradient design with glassmorphism effects
- Responsive layout that works on all devices
- Collapsible sidebar for better space utilization
- Loading overlays with animated spinners
- Intuitive form controls and validation
- Keyboard shortcuts support (Ctrl+Enter to navigate, Ctrl+L for logs)

### ⚙️ Advanced Configuration
- **FlareSolverr URL** input (optional)
- **Custom User Agent** support
- **Query Parameters** editor
- **Force Empty Cache** option
- **Cookie Management** toggle
- Multiple endpoint options (Proxy GET/POST, Browser GET)

---

## 🛠️ Installation

### Prerequisites
- **Node.js** v14 or higher
- **npm** or **yarn** package manager
- (Optional) **FlareSolverr** instance for Cloudflare bypass

### Steps

1. **Clone or download the repository**
   ```bash
   cd /app
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the server**
   ```bash
   node index.js
   ```
   
   Or with a custom port:
   ```bash
   node index.js --port 3000
   # or
   node index.js -p 3000
   ```

The server will start on `http://localhost:4006` by default.

---

## 🚀 Usage

### Web Interface

1. **Open your browser** and navigate to `http://localhost:4006`
2. **Enter the target URL** you want to proxy
3. **(Optional) Add FlareSolverr URL** if you need Cloudflare bypass
4. **(Optional) Configure additional parameters**:
   - Query parameters
   - Custom user agent
   - Cookie handling
   - Cache control
5. **Click "Navigate"** to proxy the website
6. **Click "📊 Logs & Tools"** to view request logs and monitoring

### Using FlareSolverr

FlareSolverr is a tool that bypasses Cloudflare and other anti-bot protections. To use it:

1. **Setup FlareSolverr** (if not already running):
   ```bash
   docker run -d \
     --name=flaresolverr \
     -p 8191:8191 \
     -e LOG_LEVEL=info \
     --restart unless-stopped \
     ghcr.io/flaresolverr/flaresolverr:latest
   ```

2. **In the proxy interface**, enter the FlareSolverr URL:
   ```
   http://localhost:8191/v1
   ```

3. **Navigate to your target website** - the proxy will automatically use FlareSolverr

### API Endpoints

#### GET/POST `/proxy`
Main proxy endpoint with full request interception.

**GET Example:**
```bash
curl "http://localhost:4006/proxy?url=https://example.com&forceClean=true&useCookies=true&flareSolverrUrl=http://localhost:8191/v1"
```

**POST Example:**
```bash
curl -X POST "http://localhost:4006/proxy" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "flareSolverrUrl": "http://localhost:8191/v1"
  }'
```

**Query Parameters:**
- `url` (required) - The target URL to proxy
- `flareSolverrUrl` (optional) - FlareSolverr endpoint URL
- `forceClean` (optional) - Disable caching
- `useCookies` (optional) - Forward cookies
- `userAgent` (optional) - Custom User-Agent header

#### GET `/browser`
Alternative endpoint with similar functionality.

#### GET `/api/logs`
Retrieve recent request logs in JSON format.

```bash
curl "http://localhost:4006/api/logs?limit=100"
```

#### POST `/api/logs/clear`
Clear all stored logs.

```bash
curl -X POST "http://localhost:4006/api/logs/clear"
```

---

## 🔧 How It Works

### Request Interception Flow

```
User Browser → Proxy Server → Inject Interception Script → Target Server
                    ↓
            [All requests intercepted]
                    ↓
Browser makes request → Interception script → Route through proxy → Actual resource
```

### Injected JavaScript

The proxy injects a powerful JavaScript script into every HTML page that:

1. **Intercepts Fetch API** - Rewrites all fetch() calls to go through proxy
2. **Intercepts XMLHttpRequest** - Captures and proxies all XHR/AJAX calls
3. **Intercepts Image Loading** - Overrides Image constructor and src property
4. **Intercepts Dynamic Elements** - Modifies createElement to proxy resources
5. **Intercepts Form Submissions** - Ensures form actions go through proxy
6. **Logs Everything** - Sends detailed logs to the monitoring dashboard

### URL Rewriting Engine

The server performs comprehensive URL rewriting for:
- HTML attributes (`src`, `href`, `action`, etc.)
- CSS `url()` functions
- SVG references
- Meta refresh tags
- CSS @import statements
- Srcset attributes

All relative URLs are automatically converted to proxied URLs.

---

## 📦 Dependencies

```json
{
  "axios": "^1.13.2",        // FlareSolverr API client
  "cors": "^2.8.5",          // CORS middleware
  "express": "^5.1.0",       // Web server framework
  "node-fetch": "^2.7.0",    // HTTP client
  "request": "^2.88.2",      // HTTP request library
  "zlib": "^1.0.5"           // Compression handling
}
```

---

## 🎯 Use Cases

### 1. Web Scraping
Bypass CORS restrictions and anti-bot protections while scraping websites.

### 2. Testing & Development
Test how your application behaves when loaded through a proxy or under different conditions.

### 3. Content Access
Access websites that may be restricted or blocked in your region.

### 4. Security Research
Analyze website behavior and request patterns for security research purposes.

### 5. API Testing
Test API integrations and monitor all network requests made by web applications.

---

## 🔐 Security Considerations

- This proxy removes security headers like CSP and X-Frame-Options
- Use responsibly and respect website terms of service
- Do not use for malicious purposes
- Recommended for local development and testing only
- Consider implementing authentication for production deployments

---

## 🐛 Troubleshooting

### Website not loading?
- Check if the target URL is accessible
- Try using FlareSolverr if the site has protection
- Check browser console for errors
- Review logs in the monitoring panel

### FlareSolverr not working?
- Verify FlareSolverr is running: `curl http://localhost:8191/v1`
- Check FlareSolverr logs
- Ensure correct URL format: `http://localhost:8191/v1`

### Requests not being proxied?
- Check browser console for "[PROXY]" log messages
- Verify the interception script was injected
- Some WebSocket connections may not be fully supported yet

### Performance issues?
- Increase timeout values in the code
- Use a dedicated server/VPS for better performance
- Consider implementing caching mechanisms

---

## 📈 Monitoring & Logs

### Log Entry Format
```javascript
{
  "timestamp": "2025-01-12T18:35:17.000Z",
  "type": "proxy",           // or "flaresolverr", "browser"
  "url": "https://example.com",
  "status": "success",       // or "error", "pending"
  "details": { ... }
}
```

### Real-time Monitoring
- Logs auto-refresh every 2 seconds
- Color-coded entries for easy identification
- Detailed error messages when requests fail
- Track FlareSolverr usage

---

## 🔮 Future Enhancements

- [ ] Full WebSocket proxying support
- [ ] Custom headers injection interface
- [ ] Request/response body inspection
- [ ] Traffic recording and replay
- [ ] Multiple FlareSolverr instances (load balancing)
- [ ] Authentication and access control
- [ ] Export logs to file
- [ ] Request filtering and blocking
- [ ] Performance metrics dashboard

---

## 📝 Technical Details

### Port Configuration
- Default port: 4006
- Configurable via environment variable or CLI arguments
- Binds to 0.0.0.0 (accessible from network)

### Compression Support
- Gzip decompression
- Deflate decompression
- Brotli decompression

### Request Timeout
- Default: 20 seconds
- FlareSolverr: 60 seconds (configurable)

### Log Storage
- In-memory storage (last 1000 entries)
- Automatically pruned to maintain performance

---

## 🤝 Contributing

Contributions are welcome! Feel free to:
- Report bugs
- Suggest features
- Submit pull requests
- Improve documentation

---

## 📄 License

This project is licensed under the **ISC License**.

---

## 🙏 Acknowledgements

- Original simple proxy by [jeffersoncgo](https://github.com/jeffersoncgo)
- Enhanced and improved by E1 AI Agent
- FlareSolverr by the FlareSolverr team
- Built with Express.js and modern web technologies

---

## 📞 Support

For issues, questions, or feature requests:
- Check the troubleshooting section
- Review existing logs for error details
- Consult browser developer console
- Check server console output

---

**Made with ❤️ | Enhanced Edition with Advanced Features**
