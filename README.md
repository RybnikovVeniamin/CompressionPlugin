# Image Compressor - Figma Plugin

A powerful Figma plugin for compressing images with multi-scale export support. Reduce file sizes while maintaining quality, with PNG/JPEG/WebP format options and batch processing capabilities.

![Plugin Version](https://img.shields.io/badge/version-1.0.0-blue)
![Figma API](https://img.shields.io/badge/Figma_API-1.0.0-purple)
![License](https://img.shields.io/badge/license-MIT-green)

## 🎯 Features

- **Smart Image Detection** - Automatically finds all images in your selection or entire page
- **Multi-Scale Export** - Export images at multiple scales (1x, 2x, 3x) simultaneously
- **Format Support** - Compress to PNG, JPEG, or WebP formats
- **Batch Processing** - Handle multiple images at once with queue-based processing
- **Quality Control** - Adjust compression quality for each image individually
- **Replace or Copy** - Choose to replace original images or create compressed copies
- **ZIP Export** - Download multiple compressed images as a single ZIP file
- **Non-Blocking Operations** - Smart queue system prevents Figma from freezing

## 🔧 Technologies & APIs

### Figma Plugin API (v1.0.0)

This plugin extensively uses the **Figma Plugin API** to interact with Figma documents:

#### Core APIs Used:

**Node Traversal & Selection**
- `figma.currentPage.selection` - Access user's selected elements
- `figma.currentPage.children` - Scan entire page for images
- `figma.getNodeByIdAsync()` - Retrieve specific nodes by ID

**Image Export & Creation**
- `node.exportAsync()` - Export nodes as PNG images at different scales
- `figma.createImage()` - Create new image objects from compressed data
- `figma.getImageByHash()` - Retrieve existing images by their hash
- `image.getBytesAsync()` - Get raw image data as bytes

**Node Manipulation**
- `node.fills` - Read and modify image fills on nodes
- `node.clone()` - Create copies of nodes for compressed versions
- `node.exportSettings` - Read and update export settings for multi-scale exports
- `figma.createRectangle()` - Create new rectangle nodes to hold images

**UI & Communication**
- `figma.showUI()` - Display the plugin interface
- `figma.ui.postMessage()` - Send data from plugin code to UI
- `figma.ui.onmessage` - Receive commands from UI

### External Libraries (CDN)

**Image Compression**
- [browser-image-compression](https://www.npmjs.com/package/browser-image-compression) v2.0.2
  - Handles client-side image compression
  - Supports quality adjustment and size limits
  - Provides PNG, JPEG, and WebP output

**ZIP File Creation**
- [JSZip](https://stuk.github.io/jszip/) v3.10.1
  - Creates ZIP archives in the browser
  - Enables batch download of multiple compressed images

**Typography**
- [Google Fonts - Onest](https://fonts.google.com/)
  - Modern, clean font family for the UI

### Network Access

The plugin has permission to access these domains (configured in `manifest.json`):
- `https://cdn.jsdelivr.net` - For loading browser-image-compression and JSZip
- `https://fonts.googleapis.com` - For loading Onest font
- `https://fonts.gstatic.com` - For font file delivery

## 📦 Installation

### For Development

1. Clone this repository:
```bash
git clone https://github.com/RybnikovVeniamin/CompressionPlugin.git
```

2. Open Figma Desktop App

3. Go to **Plugins** → **Development** → **Import plugin from manifest...**

4. Select the `manifest.json` file from the cloned repository

### For Users

Once published, users can install from:
- Figma Community (coming soon)
- Direct installation via plugin URL

## 🚀 How to Use

1. **Select Images** - Select one or more image layers, frames, or components in Figma
   - Or leave nothing selected to scan the entire page

2. **Open Plugin** - Go to **Plugins** → **Image Compressor**

3. **Adjust Settings**
   - Choose compression quality (0-100)
   - Select output format (PNG, JPEG, WebP)
   - Pick export scales (1x, 2x, 3x) for each image

4. **Compress**
   - Click "Compress All" to process all images
   - Or compress individual images one by one

5. **Export**
   - **Replace** - Replace original images in Figma with compressed versions
   - **Create Copy** - Create a new copy next to the original
   - **Download** - Save compressed images to your computer
   - **Download as ZIP** - Get all compressed images in one file

## 🏗️ Architecture

### Plugin Structure

```
CompressionPlugin/
├── manifest.json    # Plugin configuration & permissions
├── code.js          # Main plugin logic (Figma sandbox)
└── ui.html          # User interface (HTML/CSS/JS)
```

### Message-Based Communication

The plugin uses a message-passing system between the main thread (code.js) and UI thread (ui.html):

**Main Thread → UI**
- `plugin-ready` - Plugin initialized
- `selected-images` - Image data sent to UI
- `scan-progress` - Processing status updates
- `replace-success` - Confirmation of image replacement

**UI → Main Thread**
- `get-images-auto` - Request images (selection or page)
- `get-scaled-image` - Request specific scale export
- `compress-and-replace` - Replace original with compressed
- `create-compressed-copy` - Create new compressed copy
- `stop-processing` - Cancel current operation

### Performance Optimizations

- **Queue-Based Processing** - Images are processed in batches to prevent UI freezing
- **Export Caching** - Already exported images are cached to avoid redundant operations
- **Concurrency Control** - Limits simultaneous export operations (MAX_CONCURRENT_EXPORTS = 1)
- **Non-Blocking Operations** - Uses async/await with timeouts to keep Figma responsive

## 🎨 Use Cases

- **Design Handoff** - Provide developers with optimized assets
- **Performance Optimization** - Reduce Figma file sizes
- **Web Export** - Create web-ready images in multiple formats
- **Responsive Design** - Generate 1x, 2x, 3x versions for different screen densities
- **Batch Operations** - Compress entire design system icon sets at once

## 📄 File Structure

### manifest.json
Defines plugin metadata, API version, permissions, and network access requirements.

### code.js (766 lines)
Main plugin logic including:
- Image discovery and traversal
- Figma API interactions
- Export queue management
- Image replacement/creation
- Error handling

### ui.html (3442 lines)
Complete user interface with:
- Embedded CSS styling
- JavaScript for compression logic
- Browser-image-compression integration
- JSZip for batch downloads
- Progress tracking and user feedback

## 🛠️ Development

### Debugging

**UI Thread (ui.html)**
- Right-click plugin window → "Inspect Element"
- Use browser DevTools console

**Main Thread (code.js)**
- Figma → **Plugins** → **Development** → **Open Console**
- View console.log outputs and errors

### Key Functions

**code.js**
- `processNodeForImages()` - Discovers images in Figma nodes
- `safeExportAsync()` - Safely exports with concurrency control
- `processBatchQueue()` - Handles batched processing
- `stopProcessing()` - Cancels ongoing operations

**ui.html**
- `compressImage()` - Compresses individual images using browser-image-compression
- `compressAll()` - Batch compression with progress tracking
- `createZipAndDownload()` - Creates ZIP archive of all compressed files

## 🤝 Contributing

Contributions are welcome! Feel free to:
- Report bugs
- Suggest new features
- Submit pull requests

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Links

- [Figma Plugin API Documentation](https://www.figma.com/plugin-docs/)
- [browser-image-compression](https://www.npmjs.com/package/browser-image-compression)
- [JSZip Documentation](https://stuk.github.io/jszip/)

## 👤 Author

**Veniamin Rybnikov**
- GitHub: [@RybnikovVeniamin](https://github.com/RybnikovVeniamin)

---

Made with ❤️ for the Figma community

