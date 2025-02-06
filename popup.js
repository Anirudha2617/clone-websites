

// Main download function (modified to include multiple directory handling for images)
async function downloadFilesFromCss(cssContent) {
    const regex = /url\((['"]?)(.*?)\1\)/g;
    const imageUrls = [];
    let match;

    // Extract image URLs from the CSS content using regex
    while ((match = regex.exec(cssContent)) !== null) {
        let imageUrl = match[2].trim();

        // If the URL is relative, prepend it with default assets directory
        if (!imageUrl.startsWith("http") && !imageUrl.startsWith("/")) {
            imageUrl = `assets/images/${imageUrl}`;
        }

        imageUrls.push(imageUrl);
    }

    // Download all the extracted images
    for (const url of imageUrls) {
        const result = await handleFileDownload(url, "IMAGE", "assets/images");
        if (result.success) {
            console.log(`Downloaded image: ${result.filename}`);
        } else {
            console.warn(`Failed to download image: ${url}, Reason: ${result.reason}`);
        }
    }
}

document.getElementById("downloadPage").addEventListener("click", async () => {
    const statusDiv = document.getElementById("status");
    const progressBar = document.getElementById("progressBar");
    progressBar.style.display = "block";
    progressBar.value = 0;

    statusDiv.innerText = "Preparing download...";
    const downloadButton = document.getElementById("downloadPage");
    downloadButton.disabled = true;

    const logData = {
        downloaded: [],
        skipped: [],
        directories: {
            "html": [],
            "assets/css": [],
            "assets/js": [],
            "assets/images": [],
        },
    };

    const downloadedFiles = new Set();

    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (tabs[0] && tabs[0].id) {
            const tabId = tabs[0].id;

            try {
                const [result] = await chrome.scripting.executeScript({
                    target: { tabId },
                    func: () => {
                        const html = document.documentElement.outerHTML;
                        const links = Array.from(document.querySelectorAll('a[href]')).map(a => a.href);
                        const cssLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(link => link.href);
                        const scriptLinks = Array.from(document.querySelectorAll('script[src]')).map(script => script.src);
                        const imgLinks = Array.from(document.querySelectorAll('img[src]')).map(img => img.src);

                        return { html, links, cssLinks, scriptLinks, imgLinks };
                    },
                });

                const { html, links, cssLinks, scriptLinks, imgLinks } = result.result;

                // Download main HTML file
                await downloadHtmlFile("index.html", html, logData, downloadedFiles);

                // Download CSS, JS, and Images
                await downloadAssets(cssLinks, "assets/css", "CSS", logData, downloadedFiles);
                await downloadAssets(scriptLinks, "assets/js", "JS", logData, downloadedFiles);
                await downloadAssets(imgLinks, "assets/images", "IMAGE", logData, downloadedFiles);

                // Process and download linked HTML files
                for (const link of links) {
                    if (!downloadedFiles.has(link) && link.endsWith(".html")) {
                        const pageContent = await fetchHtmlContent(link);
                        if (pageContent) {
                            const filename = link.split('/').pop() || "default.html";
                            const directory = link.replace(filename, "");
                            await downloadHtmlFile(directory + filename, pageContent.html, logData, downloadedFiles);

                            // Download linked assets
                            await downloadAssets(pageContent.cssLinks, `${directory}assets/css`, "CSS", logData, downloadedFiles);
                            await downloadAssets(pageContent.scriptLinks, `${directory}assets/js`, "JS", logData, downloadedFiles);
                            await downloadAssets(pageContent.imgLinks, `${directory}assets/images`, "IMAGE", logData, downloadedFiles);
                        }
                    }
                }

                // Save log file
                await saveLogFile(logData);

                statusDiv.innerText = "Download complete!";
                progressBar.style.display = "none";
            } catch (error) {
                console.error("Error during download:", error);
                statusDiv.innerText = `Error: ${error.message}`;
                progressBar.style.display = "none";
            } finally {
                downloadButton.disabled = false;
            }
        }
    });
});

async function handleFileDownload(url, type, defaultDirectory) {
    const result = { filename: "", success: false, reason: "" };

    try {
        const filename = sanitizeFilename(url.split('/').pop() || "default_file");
        const directory = defaultDirectory || "assets/misc";
        result.filename = `${directory}/${filename}`;

        if (url.startsWith("http")) {
            await chrome.downloads.download({
                url,
                filename: result.filename,
            });
            result.success = true;
        } else {
            result.reason = "Invalid or unsupported file path.";
        }
    } catch (error) {
        result.reason = error.message;
    }

    return result;
}

// Ensure sanitized filenames for all downloads
function sanitizeFilename(filename) {
    return filename.replace(/[<>:"/|?*\x00-\x1F]/g, '_');
}

// Helper function to download HTML files
async function downloadHtmlFile(filename, htmlContent, logData, downloadedFiles) {
    if (!downloadedFiles.has(filename)) {
        const htmlBlob = new Blob([htmlContent], { type: "text/html" });
        const htmlUrl = URL.createObjectURL(htmlBlob);
        await chrome.downloads.download({ url: htmlUrl, filename });
        logData.directories.html.push(filename);
        logData.downloaded.push({ type: "HTML", filename, status: "success" });
        downloadedFiles.add(filename);
    }
}

// Helper function to fetch HTML content of a linked page
async function fetchHtmlContent(url) {
    try {
        const response = await fetch(url);
        const html = await response.text();

        // Parse the HTML content to extract associated assets
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");

        const cssLinks = Array.from(doc.querySelectorAll('link[rel="stylesheet"]')).map(link => link.href);
        const scriptLinks = Array.from(doc.querySelectorAll('script[src]')).map(script => script.src);
        const imgLinks = Array.from(doc.querySelectorAll('img[src]')).map(img => img.src);

        return { html, cssLinks, scriptLinks, imgLinks };
    } catch (error) {
        console.error(`Error fetching HTML content from ${url}:`, error);
        return null;
    }
}

// Helper function to download assets
async function downloadAssets(links, directory, type, logData, downloadedFiles) {
    for (const link of links) {
        if (!downloadedFiles.has(link)) {
            const result = await handleFileDownload(link, type, directory);
            if (result.success) {
                logData.directories[directory].push(result.filename);
                logData.downloaded.push({ type, url: link, filename: result.filename, status: "success" });
            } else {
                logData.skipped.push({ type, url: link, reason: result.reason });
            }
            downloadedFiles.add(link);
        }
    }
}



// Helper function to save the log file
async function saveLogFile(logData) {
    const logBlob = new Blob([JSON.stringify(logData, null, 2)], { type: "application/json" });
    const logUrl = URL.createObjectURL(logBlob);
    await chrome.downloads.download({ url: logUrl, filename: "download_report.json" });
}



// Helper function to sanitize filenames
// function sanitizeFilename(filename) {
//     const invalidChars = /[<>:"/\\|?*\x00-\x1F]/g;
//     if (invalidChars.test(filename)) {
//         console.log(`[INVALID] Filename: ${filename}`);
//         filename = filename.replace(invalidChars, '_');
//     } else {
//         console.log(`[VALID] Filename: ${filename}`);
//     }
//     return filename;
// }

// Helper function to download images, saving them in the correct directory
async function handleImageDownload(url, type) {
    const result = { filename: "", success: false, reason: "" };

    try {
        // Extract the full directory path from the URL
        const parts = url.split('/');
        const filename = sanitizeFilename(parts.pop());
        const directoryPath = "assets/images/" + parts.slice(parts.indexOf("images") + 1).join('/');
        result.filename = `${directoryPath}/${filename}`;

        // Create the directories if they don't exist (optional)
        console.log(`[REMOTE ${type}] Attempting to download: ${url}`);
        await chrome.downloads.download({
            url: url,
            filename: result.filename,
        });
        result.success = true;
    } catch (error) {
        console.warn(`[SKIPPED ${type}] Could not download: ${url}. Reason: ${error.message}`);
        result.reason = error.message;
    }

    return result;
}

// // Helper function to download other files (CSS, JS)
// async function handleFileDownload(url, type, directory) {
//     const result = { filename: "", success: false, reason: "" };

//     try {
//         const filename = sanitizeFilename(url.split('/').pop());
//         result.filename = `${directory}/${filename}`;
//         if (url.startsWith("http") || url.startsWith("https")) {
//             console.log(`[REMOTE ${type}] Attempting to download: ${url}`);
//             await chrome.downloads.download({
//                 url: url,
//                 filename: result.filename,
//             });
//             result.success = true;
//         } else {
//             console.log(`[LOCAL ${type}] Skipping local file: ${url}`);
//             result.reason = "Local files are skipped.";
//         }
//     } catch (error) {
//         console.warn(`[SKIPPED ${type}] Could not download: ${url}. Reason: ${error.message}`);
//         result.reason = error.message;
//     }

//     return result;
// }

// Extract and handle files referenced inside CSS 'url()' tags


// Helper function to determine the file type based on the URL

// function getFileType(url) {
//     if (url.match(/\.(jpg|jpeg|png|gif|svg|webp)$/i)) {
//         return "IMAGE";
//     } else if (url.match(/\.(css)$/i)) {
//         return "CSS";
//     } else if (url.match(/\.(js)$/i)) {
//         return "JS";
//     }
//     // Default to a generic file type
//     return "FILE";
// }

// // General helper function to download any file inside url() and save in the appropriate directory
// async function handleUrlFileDownload(url, type) {
//     const result = { filename: "", success: false, reason: "" };

//     try {
//         // Extract the file name from the URL
//         const urlPath = new URL(url);
//         const filename = sanitizeFilename(urlPath.pathname.split('/').pop());

//         // Determine the directory based on the type of file
//         let directory = "";
//         if (type === "IMAGE") {
//             directory = `assets/images${urlPath.pathname.substring(urlPath.pathname.indexOf("/images"))}`;
//         } else if (type === "CSS") {
//             directory = `assets/css${urlPath.pathname}`;
//         } else if (type === "JS") {
//             directory = `assets/js${urlPath.pathname}`;
//         } else {
//             throw new Error("Unsupported file type");
//         }

//         // Ensure the directory structure exists (optional, but helpful)
//         const directoryPath = directory.substring(0, directory.lastIndexOf('/'));
//         await createDirectory(directoryPath);

//         result.filename = directory;

//         // Download the file
//         console.log(`[REMOTE ${type}] Attempting to download: ${url}`);
//         await chrome.downloads.download({
//             url: url,
//             filename: result.filename,
//         });
//         result.success = true;
//     } catch (error) {
//         console.warn(`[SKIPPED ${type}] Could not download: ${url}. Reason: ${error.message}`);
//         result.reason = error.message;
//     }

//     return result;
// }


// Helper function to create directories (optional, since chrome.downloads API doesn't directly support it)
async function createDirectory(directoryPath) {
    // Since Chrome extension doesn't support creating directories directly in Downloads,
    // we ensure the structure exists by just naming the file paths properly.
    // This is more of an organizational step.
    console.log(`[CREATE DIR] Directory structure: ${directoryPath}`);
}




document.getElementById("extractLinksButton").addEventListener("click", async () => {
    const statusDiv = document.getElementById("status");
    statusDiv.innerText = "Extracting links...";

    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (tabs[0] && tabs[0].id) {
            const tabId = tabs[0].id;

            try {
                // Use chrome.scripting.executeScript to extract links
                const [result] = await chrome.scripting.executeScript({
                    target: { tabId },
                    func: () => {
                        

                        // Function to detect type based on file extension
                        const getFileType = (fileName) => {
                            const ext = fileName.split('.').pop().toLowerCase();
                            switch (ext) {
                                case 'css':
                                    return 'stylesheet';
                                case 'js':
                                    return 'script';
                                case 'jpg':
                                case 'jpeg':
                                case 'png':
                                case 'gif':
                                case 'bmp':
                                    return 'image';
                                case 'html':
                                case 'htm':
                                    return 'html';
                                default:
                                    return 'unknown'; // Unknown type if the extension doesn't match
                            }
                        };
                        
                        // Function to extract file details based on an element's attribute
                        const extractFileDetails = (element, attr, defaultDir) => {
                            const url = element.getAttribute(attr);
                            if (!url) return null;
            
                            try {
                                const fullUrl = new URL(url, window.location.href).href;
                                const pathname = new URL(fullUrl).pathname;
                                const fileName = pathname.substring(pathname.lastIndexOf('/') + 1);
                                
                                let directory = url;
                                if (directory.url.startsWith("http")){
                                    directory = `${defaultDir}/${fileName}`;
                                };
                                const type = getFileType(fileName);
            
                                return { tagName: element.tagName, type, fullUrl, directory, fileName, url };
                            } catch (error) {
                                console.error(`Error extracting details for ${attr}:`, error);
                                return null;
                            }
                        };


                        // To hold unique fullUrls
                        const uniqueUrls = new Set();
                
                        // Function to extract URLs from CSS background-image inline styles
                        const extractInlineBackgroundImages = () => {
                            const elementsWithBackgroundImage = Array.from(document.querySelectorAll('[style]')).filter(el => {
                                return el.style.backgroundImage && el.style.backgroundImage.includes('url(');
                            });
                
                            return elementsWithBackgroundImage.map(el => {
                                const urlMatch = el.style.backgroundImage.match(/url\(["']?(.*?)["']?\)/); // Extract the URL from background-image
                                if (urlMatch) {
                                    const url = urlMatch[1]; // The actual image URL
                                    // Avoid redundant data if the URL has already been processed
                                    if (!uniqueUrls.has(url)) {
                                        uniqueUrls.add(url);
                                        const fullUrl = new URL(url, window.location.href).href;
                                        const pathname = new URL(fullUrl).pathname;
                                        const fileName = pathname.substring(pathname.lastIndexOf('/') + 1);
                                        const type = getFileType(fileName);
                                        let directory = url;
                                        if (directory.url.startsWith("http")){
                                            directory = `${defaultDir}/${fileName}`;
                                        };
                
                                        return {
                                            tagName: 'DIV', // These are inline styles applied to <div> or other elements
                                            rel: null,
                                            type,
                                            fullUrl,
                                            directory: directory, // The URL or path in the inline style
                                            fileName,
                                            url,
                                        };
                                    }
                                }
                            }).filter(link => {
                                // Ensure the result is not null or undefined
                                if (!link) return false;
                        
                                // Parse the HTML string into a DOM element
                                const parser = new DOMParser();
                                const doc = parser.parseFromString(html, "text/html");
                        
                                // Replace the URL in the provided HTML content if it starts with "http"
                                if (link.fullUrl.startsWith("http")) {
                                    let tempElement = doc.querySelector(`[href="${link.fullUrl}"]`);
                                    if (tempElement) {
                                        console.log("Came to check directory:");
                                        tempElement.setAttribute("href", link.directory);
                        
                                        // Serialize the updated DOM back to a string
                                        html = doc.documentElement.outerHTML;
                                    }
                                }
                        
                                if (uniqueUrls.has(link.fullUrl)) {
                                    return false; // Skip duplicates
                                }
                        
                                uniqueUrls.add(link.fullUrl);
                                return true;
                            });
                        };
                
                        const extractCustomAttributes = () => {
                            const customFiles = [];
                        
                            // Select all elements with custom attributes containing URLs
                            const elements = Array.from(document.querySelectorAll('[data-jarallax-original-styles]'));
                        
                            elements.forEach(el => {
                                const attributeValue = el.getAttribute('data-jarallax-original-styles');
                                if (attributeValue) {
                                    // Extract URLs using regex
                                    const urlMatch = attributeValue.match(/url\s*\(["']?(.*?)["']?\)/);
                                    if (urlMatch) {
                                        const url = urlMatch[1].trim();
                                        if (!uniqueUrls.has(url)) {
                                            uniqueUrls.add(url);
                        
                                            const fullUrl = new URL(url, window.location.href).href;
                                            const pathname = new URL(fullUrl).pathname;
                                            const fileName = pathname.substring(pathname.lastIndexOf('/') + 1);
                                            const type = getFileType(fileName);
                        
                                            customFiles.push({
                                                tagName: el.tagName,
                                                rel: 'custom-attribute',
                                                type,
                                                fullUrl,
                                                directory: url,
                                                fileName,
                                            });
                                        }
                                    }
                                }
                            });
                        
                            return customFiles;
                        };
                        
                        let html = document.documentElement.outerHTML;

                        const customAttributeFiles = extractCustomAttributes();
                        

                        // Extracting links from the page with detailed properties
                        const cssLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
                        .map(link => extractFileDetails(link, 'href', "assets/css"))
                        .filter(link => {
                            // Ensure the result is not null or undefined
                            if (!link) return false;
                    
                            // Parse the HTML string into a DOM element
                            const parser = new DOMParser();
                            const doc = parser.parseFromString(html, "text/html");
                    
                            // Replace the URL in the provided HTML content if it starts with "http"
                            if (link.fullUrl.startsWith("http")) {
                                let tempElement = doc.querySelector(`[href="${link.fullUrl}"]`);
                                if (tempElement) {
                                    console.log("Came to check directory:");
                                    tempElement.setAttribute("href", link.directory);
                    
                                    // Serialize the updated DOM back to a string
                                    html = doc.documentElement.outerHTML;
                                }
                            }
                    
                            if (uniqueUrls.has(link.fullUrl)) {
                                return false; // Skip duplicates
                            }
                    
                            uniqueUrls.add(link.fullUrl);
                            return true;
                        });
                    
                
                        const scriptLinks = Array.from(document.querySelectorAll('script[src]'))
                            .map(script => extractFileDetails(script, 'src',"assets/js"))
                            .filter(link => {
                                // Ensure the result is not null or undefined
                                if (!link) return false;
                        
                                // Parse the HTML string into a DOM element
                                const parser = new DOMParser();
                                const doc = parser.parseFromString(html, "text/html");
                        
                                // Replace the URL in the provided HTML content if it starts with "http"
                                if (link.fullUrl.startsWith("http")) {
                                    let tempElement = doc.querySelector(`[href="${link.fullUrl}"]`);
                                    if (tempElement) {
                                        console.log("Came to check directory:");
                                        tempElement.setAttribute("href", link.directory);
                        
                                        // Serialize the updated DOM back to a string
                                        html = doc.documentElement.outerHTML;
                                    }
                                }
                        
                                if (uniqueUrls.has(link.fullUrl)) {
                                    return false; // Skip duplicates
                                }
                        
                                uniqueUrls.add(link.fullUrl);
                                return true;
                            });
                
                        const imgLinks = Array.from(document.querySelectorAll('img[src]'))
                            .map(img => extractFileDetails(img, 'src',"assets/images"))
                            .filter(link => {
                                // Ensure the result is not null or undefined
                                if (!link) return false;
                        
                                // Parse the HTML string into a DOM element
                                const parser = new DOMParser();
                                const doc = parser.parseFromString(html, "text/html");
                        
                                // Replace the URL in the provided HTML content if it starts with "http"
                                if (link.fullUrl.startsWith("http")) {
                                    let tempElement = doc.querySelector(`[href="${link.fullUrl}"]`);
                                    if (tempElement) {
                                        console.log("Came to check directory:");
                                        tempElement.setAttribute("href", link.directory);
                        
                                        // Serialize the updated DOM back to a string
                                        html = doc.documentElement.outerHTML;
                                    }
                                }
                        
                                if (uniqueUrls.has(link.fullUrl)) {
                                    return false; // Skip duplicates
                                }
                        
                                uniqueUrls.add(link.fullUrl);
                                return true;
                            });
                
                        const htmlLinks = Array.from(document.querySelectorAll('a[href]'))
                            .map(a => extractFileDetails(a, 'href', "" ))
                            .filter(link => {
                                // Ensure the result is not null or undefined
                                if (!link) return false;
                        
                                // Parse the HTML string into a DOM element
                                const parser = new DOMParser();
                                const doc = parser.parseFromString(html, "text/html");
                        
                                // Replace the URL in the provided HTML content if it starts with "http"
                                if (link.fullUrl.startsWith("http")) {
                                    let tempElement = doc.querySelector(`[href="${link.fullUrl}"]`);
                                    if (tempElement) {
                                        console.log("Came to check directory:");
                                        tempElement.setAttribute("href", link.directory);
                        
                                        // Serialize the updated DOM back to a string
                                        html = doc.documentElement.outerHTML;
                                    }
                                }
                        
                                if (uniqueUrls.has(link.fullUrl)) {
                                    return false; // Skip duplicates
                                }
                        
                                uniqueUrls.add(link.fullUrl);
                                return true;
                            });
                        
                        
                        
                        // Extracting background images from inline styles (corrected)
                        const inlineBackgroundImages = extractInlineBackgroundImages();

                        const filesToDownload = [
                            ...cssLinks,
                            ...scriptLinks,
                            ...imgLinks,
                            ...htmlLinks,
                            ...inlineBackgroundImages,
                            ...customAttributeFiles,
                        ];

                        return { cssLinks, scriptLinks, imgLinks, htmlLinks, inlineBackgroundImages, filesToDownload, customAttributeFiles, html };
                    }
                });
                
                if (!result || !result.result) {
                    console.error("Failed to extract links. Result is null.");
                    statusDiv.innerText = "Error: Unable to extract links.";
                    return;
                }
                
                // Safely destructure result.result
                // const { cssLinks, filesToDownload, html } = result.result || {};

                // Log the extracted links
                const { cssLinks, scriptLinks, imgLinks, htmlLinks, inlineBackgroundImages, filesToDownload, customAttributeFiles, html } = result.result || {};
                if (!cssLinks || !filesToDownload || !html) {
                    console.error("Extracted data is incomplete.");
                    statusDiv.innerText = "Error: Extracted data is incomplete.";
                    return;
                }


                console.log("CSS Links:", cssLinks);
                console.log("Script Links:", scriptLinks);
                console.log("Image Links:", imgLinks);
                console.log("HTML Links:", htmlLinks);
                console.log("Inline Background Images:", inlineBackgroundImages);
                console.log("Merged:", filesToDownload);
                
                const htmlBlob = new Blob([html], { type: "text/html" });
                const htmlUrl = URL.createObjectURL(htmlBlob);
                
                await chrome.downloads.download({
                    url: htmlUrl,
                    filename: "index.html", // Correctly specify the filename
                    saveAs: false, // Set to 'true' if you want the "Save As" dialog to show
                });
                

                  
                
                // Create a JSON object with the extracted data

                async function downloadFile(file) {
                    return new Promise((resolve, reject) => {
                        try {
                            // Validate HTTPS URL
                            if (!file.fullUrl.startsWith('https://')) {
                                console.log(`Skipping non-HTTPS file: ${file.fullUrl}`);
                                resolve('failed'); // Skip non-HTTPS URLs
                                return;
                            }
                
                            // Trigger the download
                            chrome.downloads.download(
                                {
                                    url: file.fullUrl,
                                    filename: file.directory, // Specify the file path (directory and name)
                                    saveAs: false, // Set to 'true' to show the "Save As" dialog
                                },
                                function (downloadId) {
                                    if (chrome.runtime.lastError) {
                                        // Handle runtime errors
                                        reject(`Error downloading ${file.fullUrl}: ${chrome.runtime.lastError.message}`);
                                    } else {
                                        console.log(`Download started for: ${file.fullUrl}`);
                                        resolve('success'); // Successfully triggered download
                                    }
                                }
                            );
                        } catch (error) {
                            reject(`Error in downloadFile function: ${error.message}`);
                        }
                    });
                }
                
                
                
                const totalFiles = filesToDownload.length;
                let filesDownloaded = 0;
                
                // Set progress max value and reset progress bar
                document.getElementById('progressBar').max = totalFiles;
                document.getElementById('progressBar').value = 0;
                progressBar.style.display = "block";
                
                // Loop through the files and download each one
                for (const file of filesToDownload) {
                    try {
                        file.status = 'Downloading'; // Set status to "Downloading" initially
                        await downloadFile(file);
                        file.status = 'Completed'; // Update status to "Completed" after successful download
                    } catch (error) {
                        file.status = 'Failed'; // Update status to "Failed" if there's an error
                        console.error(`Failed to download ${file.fileName}: ${error}`);
                    }
                
                    filesDownloaded++;
                
                    // Update the progress bar
                    document.getElementById('progressBar').value = filesDownloaded;
                }
                
                // Notify that all downloads are complete
                document.getElementById('status').innerText = 'All files downloaded successfully!';
                


                const data = {
                    customAttributeFiles,
                    filesToDownload,
                    cssLinks,
                    scriptLinks,
                    imgLinks,
                    htmlLinks,
                    inlineBackgroundImages,
                    
                };

                // Convert the data to a JSON string
                const jsonData = JSON.stringify(data, null, 2);

                // Save the extracted data as a JSON file inside "ani" folder
                const jsonFile = new Blob([jsonData], { type: 'application/json' });
                const jsonFileUrl = URL.createObjectURL(jsonFile);

                chrome.downloads.download({
                    url: jsonFileUrl,
                    filename: "ani/extracted_links.json",  // Specify the folder and file name
                });


                // Clean up
                URL.revokeObjectURL(jsonFileUrl);

                statusDiv.innerText = "Links extracted and saved successfully.";
            } catch (error) {
                console.error("Error during link extraction:", error);
                statusDiv.innerText = `Error: ${error.message}`;
            }
        }
    });
});

                // const blob = new Blob([jsonData], { type: "application/json" });
                // const url = URL.createObjectURL(blob);
                // const a = document.createElement("a");
                // a.href = url;
                // a.download = "ani/extracted_links.json"; // Suggest folder "ani" with file name
                // a.click();
