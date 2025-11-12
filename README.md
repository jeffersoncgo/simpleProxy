# 📖 simpleProxy

A lightweight, high-performance HTTP proxy server built with Node.js and Express. Perfect for bypassing CORS restrictions, intercepting requests, and rewriting URLs on-the-fly with a user-friendly web interface.

---

## ✨ Features

- 🌐 **Full CORS Support** — Access any website without CORS restrictions
- 🔄 **Automatic URL Rewriting** — Intelligently rewrites relative URLs in HTML, CSS, and SVG
- 📦 **Compression Handling** — Automatically decompresses gzip and deflate content
- 🍪 **Cookie Management** — Optional cookie support for authenticated requests
- 🔌 **Dual Endpoints** — Both `/proxy` (standard) and `/browser` (alternative) endpoints
- 🖥️ **Interactive Web UI** — Test the proxy with an intuitive browser-based interface
- 📝 **Request Customization** — Support for custom headers, query parameters, and user agents
- 🔐 **Security Headers Cleanup** — Removes restrictive headers like X-Frame-Options and CSP
- ⚡ **Polyfills** — Includes Element.prototype.replaceChildren polyfill for older browsers
- 📡 **Request/Response Interception** — Hooks for Fetch API and XHR monitoring

---

## 🚀 Installation

### Prerequisites

- **Node.js** v14 or higher
- **npm** or **yarn** package manager

### Steps

1. **Clone the repository**
   ```bash
   git clone https://github.com/jeffersoncgo/simpleProxy.git
   cd simpleProxy
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the server**
   ```bash
   npm start
   ```
   or with a custom port:
   ```bash
   npm start -- --port 3000
   npm start -- -p 3000
   ```

The server will start on `http://localhost:4006` by default.

### Using the Live Version

You can use the live version hosted on GitHub without installing anything:

**[https://github.com/jeffersoncgo/simpleProxy/](https://github.com/jeffersoncgo/simpleProxy/)**

---

## 🛠️ Usage

### Web Interface

1. Open your browser and navigate to `http://localhost:4006`
2. Enter the target URL in the input field
3. (Optional) Add query parameters
4. Choose between **Proxy** or **Browser** endpoints
5. Toggle **Use Empty Cache** to set cache-control headers
6. Toggle **Use Cookies** to forward cookies in requests
7. Click **Navigate**

### API Endpoints

#### GET `/proxy`
Proxies a request to the specified URL and processes the response.

```bash
curl "http://localhost:4006/proxy?url=http://example.com"
```

**Query Parameters:**
- `url` (required) — The target URL to proxy
- `forceClean` — Disable caching (sets Cache-Control headers)
- `useCookies` — Forward cookies to the target server
- `userAgent` — Custom User-Agent header

#### POST `/proxy`
Alternative POST method for proxying requests.

```bash
curl -X POST "http://localhost:4006/proxy" \
  -H "Content-Type: application/json" \
  -d '{"url":"http://example.com","queryParams":""}'
```

#### GET `/browser`
Alternative endpoint with fallback handling.

```bash
curl "http://localhost:4006/browser?url=http://example.com"
```

### URL Rewriting Examples

The proxy automatically rewrites URLs in:

- **HTML attributes**: `src`, `href`, `action`, `data`, `poster`, `formaction`, etc.
- **CSS functions**: `url()` in stylesheets
- **SVG references**: `xlink:href`, `href`, and internal URL references
- **Meta refresh**: HTML meta refresh tags
- **CSS imports**: `@import` statements

**Example:**
When proxying `http://example.com`, a relative URL like `./img.png` is automatically converted to:
```
http://localhost:4006/proxy?url=http://example.com/img.png
```

---

## 📦 Technologies

- **Node.js** — JavaScript runtime
- **Express.js** — Web application framework
- **request** — HTTP client library
- **zlib** — Compression/decompression
- **CORS** — Cross-Origin Resource Sharing middleware
- **Vanilla JavaScript** — Frontend logic

---

## 🔧 Configuration

### Environment Variables

```bash
port=3000 npm start
```

### Command-Line Arguments

```bash
npm start -- --port 3000
npm start -- -p 3000
```

### Default Configuration

- **Default Port**: 4006
- **Host**: 0.0.0.0 (accessible from any interface)
- **Request Timeout**: 20 seconds
- **Default User-Agent**: Chrome 123.0.0.0 on Windows 10

---

## ✅ Requirements

- Node.js v14+
- npm or yarn
- Modern web browser for the UI

**Minimum System Requirements:**
- RAM: 64MB
- Disk Space: ~50MB (including node_modules)
- CPU: Any modern processor

---

## 🗂️ Repository Structure

```
simpleProxy/
├── index.js              # Main server application
├── index.html            # Web UI interface
├── package.json          # Project metadata and dependencies
└── README.md             # Documentation
```

### File Descriptions

#### `index.js`
The core server application containing:
- **Express setup** — Server initialization with CORS and middleware
- **URL rewriting engine** — Regex patterns for HTML, CSS, and SVG parsing
- **Request handler** — Processes proxied requests and responses
- **Response processor** — Handles compression, decompression, and content transformation
- **Route handlers** — `/proxy`, `/browser`, and `/` endpoints
- **Error handling** — Graceful error management with logging

**Key Functions:**
- `safeSetHeaders()` — Sets response headers while removing restrictive ones
- `rewriteLocalPaths()` — Main URL rewriting logic
- `makeRequestOptions()` — Constructs request configuration

#### `index.html`
Frontend interface featuring:
- **URL Input Form** — Enter target URLs
- **Endpoint Selector** — Choose between proxy modes
- **Query Parameter Input** — Custom parameters
- **Option Toggles** — Cache and cookie controls
- **Iframe Display** — Results rendering
- **JavaScript Logic** — Form handling and navigation

#### `package.json`
Project configuration:
- Dependencies declaration
- Script definitions
- Project metadata
- License information (ISC)

---

## 🔗 Request Flow Diagram

```mermaid
graph TD
    A[User Browser] -->|1. Enter URL| B[Web UI]
    B -->|2. Click Navigate| C{GET or POST?}
    C -->|GET| D[/proxy or /browser Endpoint]
    C -->|POST| E[/proxy Endpoint - POST]
    D -->|3. Create Request Options| F[makeRequestOptions]
    E -->|3. Create Request Options| F
    F -->|4. Extract & Validate| G[Target URL, Headers, Params]
    G -->|5. Make HTTP Request| H[Remote Server]
    H -->|6. Get Response| I[Response Handler]
    I -->|7a. Decompress| J[Check Encoding]
    J -->|gzip/deflate| K[zlib Decompress]
    K -->|8. Check Content Type| L{HTML?}
    J -->|none| L
    L -->|Yes| M[Rewrite Local Paths]
    M -->|9. Regex Replacements| N[URL Rewriting Engine]
    N -->|10a. HTML Attributes| O[src, href, action...]
    N -->|10b. CSS URLs| P[url() patterns]
    N -->|10c. SVG References| Q[xlink:href, href]
    N -->|10d. Meta Refresh| R[Meta tags]
    N -->|10e. CSS Imports| S[@import statements]
    O -->|11. Convert to Proxied URLs| T[http://localhost:4006/proxy?url=...]
    P --> T
    Q --> T
    R --> T
    S --> T
    T -->|12. Add Polyfills| U[Element.replaceChildren Polyfill]
    U -->|13. Inject Request Interception| V[Fetch & XHR Hooks]
    L -->|No| W[Set Safe Headers]
    U --> W
    V --> W
    W -->|14. Remove Restrictive Headers| X[Delete CSP, X-Frame-Options, etc]
    X -->|15. Send Response| Y[Browser iframe]
    Y -->|16. Display Content| Z[User Sees Proxied Page]
```

---

## 🤝 Contributing

Contributions are welcome! To contribute:

1. Fork the repository
2. Create a new branch (`git checkout -b feature/your-feature`)
3. Make your changes
4. Commit with clear messages (`git commit -am 'Add new feature'`)
5. Push to the branch (`git push origin feature/your-feature`)
6. Open a Pull Request

**Code Style:**
- Use 2-space indentation
- Follow existing code conventions
- Add comments for complex logic
- Test thoroughly before submitting

---

## 📄 Documentation

### Common Issues & Solutions

**CORS Errors**
- Use the proxy endpoints to bypass CORS restrictions
- Ensure the target URL is accessible from your server

**Relative URLs Not Working**
- The proxy should automatically rewrite them
- Check browser console for any JavaScript errors

**SSL Certificate Warnings**
- The proxy accepts self-signed certificates
- Set `rejectUnauthorized: false` in request options (already configured)

**Performance**
- The 20-second timeout can be adjusted in `makeRequestOptions()`
- Consider using a CDN for frequently accessed resources

### API Reference

See the **Usage** section above for detailed endpoint documentation.

---

## ❤️ Acknowledgements

- Built with [Express.js](https://expressjs.com/)
- Request handling via [node-request](https://github.com/request/request)
- CORS support using [cors](https://github.com/expressjs/cors)
- Inspired by the need for simple, effective web proxying

---

## 📝 License

This project is licensed under the **ISC License** — see the LICENSE file for details.

---

## 🔗 Quick Links

- **GitHub Repository**: [https://github.com/jeffersoncgo/simpleProxy/](https://github.com/jeffersoncgo/simpleProxy/)
- **Issues & Bugs**: [Report an Issue](https://github.com/jeffersoncgo/simpleProxy/issues)
- **Live Demo**: Available at the repository

---

**Made with ❤️ by [jeffersoncgo](https://github.com/jeffersoncgo)**
