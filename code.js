// This file contains the main plugin logic that runs in Figma's sandbox

// Show the plugin UI when the plugin starts
figma.showUI(__html__, { 
  width: 400, 
  height: 600,
  themeColors: true 
});

// Optimized batch processing with queue
let processingQueue = [];
let isCurrentlyProcessing = false;
let shouldStopProcessing = false;

// Cache for exported images to avoid re-exporting
let exportCache = new Map();

// Helper function to process nodes in batches, non-blocking
async function processNodeForImages(node, imageNodes, scale, useCurrentView) {
  console.log('Processing node: ' + node.name + ' (type: ' + node.type + ')');
  
  // Add to queue instead of processing immediately
  processingQueue.push({
    node: node,
    imageNodes: imageNodes,
    scale: scale,
    useCurrentView: useCurrentView
  });
  
  // Start batch processing if not already running
  if (!isCurrentlyProcessing) {
    await processBatchQueue();
  }
}

// Process queue in batches to prevent UI blocking
async function processBatchQueue() {
  if (isCurrentlyProcessing || processingQueue.length === 0) return;
  
  isCurrentlyProcessing = true;
  shouldStopProcessing = false;
  
  const BATCH_SIZE = 5; // Process 5 items at once
  const DELAY_BETWEEN_BATCHES = 10; // 10ms delay between batches
  
  try {
    while (processingQueue.length > 0 && !shouldStopProcessing) {
      // Take a batch from the queue
      const batch = processingQueue.splice(0, BATCH_SIZE);
      
      // Process batch items in parallel
      await Promise.all(batch.map(async (item) => {
        try {
          await processNodeForImagesInternal(item.node, item.imageNodes, item.scale, item.useCurrentView);
        } catch (error) {
          console.error('Error processing node:', item.node.name, error);
          figma.ui.postMessage({
            type: 'image-processing-error',
            nodeName: item.node.name,
            error: error.message
          });
        }
      }));
      
      // Update progress
      const remainingItems = processingQueue.length;
      if (remainingItems > 0) {
        figma.ui.postMessage({
          type: 'scan-progress',
          message: 'Processing... (' + remainingItems + ' items remaining)'
        });
      }
      
      // Give UI time to breathe
      if (processingQueue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
      }
    }
  } finally {
    isCurrentlyProcessing = false;
  }
}

// Function to stop processing (useful for cancel operations)
function stopProcessing() {
  shouldStopProcessing = true;
  processingQueue = [];
}

async function processNodeForImagesInternal(node, imageNodes, scale, useCurrentView) {
  // Special handling for sections - add children to queue instead of recursive processing
  if (node.type === 'SECTION') {
    console.log('Processing SECTION: ' + node.name + ' with ' + (node.children ? node.children.length : 0) + ' children');
    // Add children to processing queue instead of recursive calls
    if ('children' in node && node.children.length > 0) {
      for (let i = 0; i < node.children.length; i++) {
        processingQueue.push({
          node: node.children[i],
          imageNodes: imageNodes,
          scale: scale,
          useCurrentView: useCurrentView
        });
      }
    }
    return;
  }

  // Check for existing image fills first
  if ('fills' in node && node.fills && node.fills.length > 0) {
    console.log('Node ' + node.name + ' has ' + node.fills.length + ' fills');
    for (let j = 0; j < node.fills.length; j++) {
      const fill = node.fills[j];
      if (fill.type === 'IMAGE') {
        console.log('Found IMAGE fill in ' + node.name + ', useCurrentView: ' + useCurrentView);
        try {
          let imageData;
          
          // Create cache key for this export operation
          const cacheKey = node.id + '_' + scale + '_' + (useCurrentView ? 'rendered' : fill.imageHash);
          
          // Check cache first
          if (exportCache.has(cacheKey)) {
            console.log('Using cached image data for ' + node.name);
            imageData = exportCache.get(cacheKey);
          } else {
            if (useCurrentView) {
              console.log('Exporting ' + node.name + ' at scale ' + scale + '...');
              const exportSettings = {
                format: 'PNG',
                constraint: { type: 'SCALE', value: scale }
              };
              imageData = await node.exportAsync(exportSettings);
              console.log('Successfully exported ' + node.name + ', size: ' + imageData.length + ' bytes');
            } else if (fill.imageHash) {
              console.log('Getting image by hash for ' + node.name + '...');
              const image = figma.getImageByHash(fill.imageHash);
              imageData = image ? await image.getBytesAsync() : undefined;
              if (imageData) {
                console.log('Successfully got image by hash for ' + node.name + ', size: ' + imageData.length + ' bytes');
              } else {
                console.log('Failed to get image by hash for ' + node.name);
              }
            }
            
            // Cache the result if successful
            if (imageData) {
              exportCache.set(cacheKey, imageData);
              // Limit cache size to prevent memory issues
              if (exportCache.size > 100) {
                const firstKey = exportCache.keys().next().value;
                exportCache.delete(firstKey);
              }
            }
          }

          if (imageData) {
            console.log('Adding ' + node.name + ' to image list');
            
            // Get all export settings from the node
            let exportScales = [1]; // Default to 1x
            if (node.exportSettings && node.exportSettings.length > 0) {
              const scaleSettings = [];
              for (let i = 0; i < node.exportSettings.length; i++) {
                const setting = node.exportSettings[i];
                if (setting.constraint && setting.constraint.type === 'SCALE') {
                  scaleSettings.push(setting.constraint.value);
                }
              }
              if (scaleSettings.length > 0) {
                exportScales = scaleSettings;
              }
            }
            
            imageNodes.push({
              id: node.id,
              name: node.name,
              imageData: Array.from(imageData),
              width: node.width * scale,
              height: node.height * scale,
              originalWidth: node.width,
              originalHeight: node.height,
              scale: scale,
              exportScales: exportScales, // Add all export scales from Figma settings
              type: useCurrentView ? 'rendered-image' : 'existing-image'
            });
            break; // Only take first image fill
          } else {
            console.log('No image data obtained for ' + node.name);
          }
        } catch (error) {
          console.error('Error collecting image data for node', node.name, error);
          // Send error to UI for user feedback
          figma.ui.postMessage({
            type: 'image-processing-error',
            nodeName: node.name,
            error: error.message
          });
        }
      }
    }
  }

  // Check if this is a container that we can export as image
  const canExportAsImage = node.type === 'FRAME' || 
                          node.type === 'GROUP' || 
                          node.type === 'COMPONENT' || 
                          node.type === 'INSTANCE' ||
                          node.type === 'COMPONENT_SET';

  if (canExportAsImage) {
    console.log('Attempting to export ' + node.name + ' (' + node.type + ') as image...');
    try {
      // Check cache for frame export
      const frameCacheKey = node.id + '_frame_' + scale;
      let imageData;
      
      if (exportCache.has(frameCacheKey)) {
        console.log('Using cached frame data for ' + node.name);
        imageData = exportCache.get(frameCacheKey);
      } else {
        const exportSettings = { 
          format: 'PNG',
          constraint: {
            type: 'SCALE',
            value: scale
          }
        };
        
        console.log('Exporting ' + node.name + ' with settings:', exportSettings);
        imageData = await node.exportAsync(exportSettings);
        console.log('Successfully exported ' + node.name + ' as image, size: ' + imageData.length + ' bytes');
        
        // Cache the frame export
        exportCache.set(frameCacheKey, imageData);
        // Limit cache size
        if (exportCache.size > 100) {
          const firstKey = exportCache.keys().next().value;
          exportCache.delete(firstKey);
        }
      }
      
      // Get all export settings from the node
      let exportScales = [1]; // Default to 1x
      if (node.exportSettings && node.exportSettings.length > 0) {
        const scaleSettings = [];
        for (let i = 0; i < node.exportSettings.length; i++) {
          const setting = node.exportSettings[i];
          if (setting.constraint && setting.constraint.type === 'SCALE') {
            scaleSettings.push(setting.constraint.value);
          }
        }
        if (scaleSettings.length > 0) {
          exportScales = scaleSettings;
        }
      }
      
      imageNodes.push({
        id: node.id,
        name: node.name,
        imageData: Array.from(imageData),
        width: node.width * scale,
        height: node.height * scale,
        originalWidth: node.width,
        originalHeight: node.height,
        scale: scale,
        exportScales: exportScales, // Add all export scales from Figma settings
        type: 'generated-image'
      });
    } catch (error) {
      console.error('Error exporting node as image:', node.name, error);
      // Send error to UI for user feedback
      figma.ui.postMessage({
        type: 'image-processing-error',
        nodeName: node.name,
        error: error.message
      });
    }
  }
}

// Listen for messages from the UI
figma.ui.onmessage = async function(msg) {
  console.log('Received message:', msg.type);

  if (msg.type === 'get-selected-images') {
    // Get all selected image nodes and frames
    const imageNodes = [];
    const scale = msg.scale || 1; // Default to 1x if no scale provided
    // Default to true so we use rendered/current view if UI doesn't send a flag
    const useCurrentView = msg.useCurrentView !== false;
    
    // Process selected nodes in batches
    for (let i = 0; i < figma.currentPage.selection.length; i++) {
      const node = figma.currentPage.selection[i];
      await processNodeForImages(node, imageNodes, scale, useCurrentView);
    }
    
    // Wait for queue to finish processing
    while (isCurrentlyProcessing && processingQueue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    figma.ui.postMessage({
      type: 'selected-images',
      images: imageNodes
    });
  }

  // Scan entire current page and collect frames and image nodes
  if (msg.type === 'get-page-images') {
    console.log('Starting page scan...');
    try {
      const imageNodes = [];
      const scale = msg.scale || 1;
      const useCurrentView = msg.useCurrentView !== false; // default true

      // Show progress to user
      figma.ui.postMessage({
        type: 'scan-progress',
        message: 'Scanning page for images...'
      });

      // Traverse all nodes on the current page
      const topLevelNodes = figma.currentPage.children;
      console.log('Found ' + topLevelNodes.length + ' top-level nodes to process');
      
      for (let i = 0; i < topLevelNodes.length; i++) {
        const node = topLevelNodes[i];
        console.log('Processing top-level node ' + (i + 1) + '/' + topLevelNodes.length + ': ' + node.name);
        
        // Update progress
        figma.ui.postMessage({
          type: 'scan-progress',
          message: 'Processing ' + node.name + '... (' + (i + 1) + '/' + topLevelNodes.length + ')'
        });
        
        await processNodeForImages(node, imageNodes, scale, useCurrentView);
      }
      
      // Wait for queue to finish processing all page nodes
      while (isCurrentlyProcessing && processingQueue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      console.log('Page scan complete. Found ' + imageNodes.length + ' images');
      figma.ui.postMessage({
        type: 'selected-images',
        images: imageNodes
      });
    } catch (error) {
      console.error('Error scanning page images:', error);
      figma.ui.postMessage({
        type: 'error',
        message: 'Failed to scan page: ' + error.message
      });
    }
  }

  // Auto: if there is a current selection, use it; else scan the page
  if (msg.type === 'get-images-auto') {
    console.log('Starting auto image collection...');
    try {
      const imageNodes = [];
      const scale = msg.scale || 1;
      const useCurrentView = msg.useCurrentView !== false;

      const hasSelection = figma.currentPage.selection && figma.currentPage.selection.length > 0;
      console.log('Has selection: ' + hasSelection + ', selection length: ' + figma.currentPage.selection.length);
      
      const nodes = hasSelection ? figma.currentPage.selection : figma.currentPage.children;
      const sourceType = hasSelection ? 'selection' : 'page';
      
      // Show progress to user
      figma.ui.postMessage({
        type: 'scan-progress',
        message: hasSelection ? 'Processing selected items...' : 'Scanning page for images...'
      });
      
      console.log('Processing ' + nodes.length + ' nodes from ' + sourceType);
      
      for (let i = 0; i < nodes.length; i++) {
        console.log('Processing node ' + (i + 1) + '/' + nodes.length + ': ' + nodes[i].name);
        
        // Update progress for longer scans
        if (nodes.length > 3) {
          figma.ui.postMessage({
            type: 'scan-progress',
            message: 'Processing ' + nodes[i].name + '... (' + (i + 1) + '/' + nodes.length + ')'
          });
        }
        
        await processNodeForImages(nodes[i], imageNodes, scale, useCurrentView);
      }
      
      // Wait for queue to finish processing
      while (isCurrentlyProcessing && processingQueue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      console.log('Auto collection complete. Found ' + imageNodes.length + ' images from ' + sourceType);
      figma.ui.postMessage({ type: 'selected-images', images: imageNodes });
    } catch (error) {
      console.error('Error in auto image collection:', error);
      figma.ui.postMessage({ type: 'error', message: 'Failed to collect images: ' + error.message });
    }
  }

  if (msg.type === 'compress-and-replace') {
    try {
      // Find the node to replace
      const node = await figma.getNodeByIdAsync(msg.nodeId);
      if (!node || !('fills' in node)) {
        figma.ui.postMessage({
          type: 'error',
          message: 'Could not find the image to replace'
        });
        return;
      }

      // Create new image from compressed data
      const compressedImageData = new Uint8Array(msg.compressedImageData);
      const newImage = figma.createImage(compressedImageData);
      
      // Replace the image fill
      const newFills = node.fills.map(function(fill) {
        if (fill.type === 'IMAGE') {
          return Object.assign({}, fill, {
            imageHash: newImage.hash
          });
        }
        return fill;
      });
      
      node.fills = newFills;
      
      figma.ui.postMessage({
        type: 'replace-success',
        message: 'Image successfully compressed and replaced!'
      });

    } catch (error) {
      console.error('Error replacing image:', error);
      figma.ui.postMessage({
        type: 'error',
        message: 'Failed to replace image: ' + error.message
      });
    }
  }

  if (msg.type === 'create-compressed-copy') {
    try {
      // Find the original node
      const originalNode = await figma.getNodeByIdAsync(msg.nodeId);
      if (!originalNode || !('fills' in originalNode)) {
        figma.ui.postMessage({
          type: 'error',
          message: 'Could not find the original image'
        });
        return;
      }

      // Create new image from compressed data
      const compressedImageData = new Uint8Array(msg.compressedImageData);
      const newImage = figma.createImage(compressedImageData);
      
      // Clone the original node
      const newNode = originalNode.clone();
      newNode.name = originalNode.name + ' (Compressed)';
      
      // Set the compressed image
      const newFills = newNode.fills.map(function(fill) {
        if (fill.type === 'IMAGE') {
          return Object.assign({}, fill, {
            imageHash: newImage.hash
          });
        }
        return fill;
      });
      
      newNode.fills = newFills;
      
      // Position the new node next to the original
      newNode.x = originalNode.x + originalNode.width + 20;
      newNode.y = originalNode.y;
      
      figma.ui.postMessage({
        type: 'copy-success',
        message: 'Compressed copy created successfully!'
      });

    } catch (error) {
      console.error('Error creating compressed copy:', error);
      figma.ui.postMessage({
        type: 'error',
        message: 'Failed to create compressed copy: ' + error.message
      });
    }
  }

  if (msg.type === 'create-image-from-frame') {
    try {
      // Find the original frame
      const originalFrame = await figma.getNodeByIdAsync(msg.frameId);
      if (!originalFrame) {
        figma.ui.postMessage({
          type: 'error',
          message: 'Could not find the original frame'
        });
        return;
      }

      // Create new image from compressed data
      const compressedImageData = new Uint8Array(msg.compressedImageData);
      const newImage = figma.createImage(compressedImageData);
      
      // Create a new rectangle to hold the image
      const rectangle = figma.createRectangle();
      rectangle.name = msg.frameName + ' (Compressed Image)';
      
      // Set the rectangle size to match the original frame
      rectangle.resize(originalFrame.width, originalFrame.height);
      
      // Set the image as fill
      rectangle.fills = [{
        type: 'IMAGE',
        imageHash: newImage.hash,
        scaleMode: 'FILL'
      }];
      
      // Position the new rectangle next to the original frame
      rectangle.x = originalFrame.x + originalFrame.width + 20;
      rectangle.y = originalFrame.y;
      
      // Add to the same parent as the original frame
      if (originalFrame.parent) {
        originalFrame.parent.appendChild(rectangle);
      }
      
      figma.ui.postMessage({
        type: 'copy-success',
        message: 'Compressed image created successfully from frame!'
      });

    } catch (error) {
      console.error('Error creating image from frame:', error);
      figma.ui.postMessage({
        type: 'error',
        message: 'Failed to create image from frame: ' + error.message
      });
    }
  }

  // Handle request for scaled image
  if (msg.type === 'get-scaled-image') {
    try {
      const node = await figma.getNodeByIdAsync(msg.nodeId);
      if (!node) {
        figma.ui.postMessage({
          type: 'scaled-image-data',
          nodeId: msg.nodeId,
          error: 'Node not found'
        });
        return;
      }

      // Export node at specified scale
      const exportSettings = {
        format: 'PNG',
        constraint: { type: 'SCALE', value: msg.scale }
      };
      
      const imageData = await node.exportAsync(exportSettings);
      
      figma.ui.postMessage({
        type: 'scaled-image-data',
        nodeId: msg.nodeId,
        imageData: Array.from(imageData)
      });

    } catch (error) {
      console.error('Error getting scaled image:', error);
      figma.ui.postMessage({
        type: 'scaled-image-data',
        nodeId: msg.nodeId,
        error: error.message
      });
    }
  }

  if (msg.type === 'cancel') {
    figma.closePlugin();
  }
  
  if (msg.type === 'stop-processing') {
    console.log('Stopping processing...');
    stopProcessing();
    figma.ui.postMessage({
      type: 'processing-stopped',
      message: 'Processing has been stopped'
    });
  }
};

// When the plugin starts, automatically get selected images
figma.ui.postMessage({ type: 'plugin-ready' });