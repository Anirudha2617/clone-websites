document.getElementById("downloadPage").addEventListener("click", async () => {
    const statusDiv = document.getElementById("status");
    const progressBar = document.getElementById("progressBar");
    progressBar.style.display = "block"; // Show progress bar
    progressBar.value = 0; // Reset progress bar
  
    statusDiv.innerText = "Preparing download...";
  
    // Initialize log data
    const logData = {
      downloaded: [],
      skipped: [],
      directories: {
        "assets/css": [],
        "assets/js": [],
        "external/js": [],
      },
    };
  
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (tabs[0] && tabs[0].id) {
        const tabId = tabs[0].id;
  
        try {
          // Get the page source and extract linked resources
          const [result] = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
              const html = document.documentElement.outerHTML;
  
              const cssLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
                .map(link => link.href);
  
              const scriptLinks = Array.from(document.querySelectorAll('script[src]'))
                .map(script => script.src);
  
              return { html, cssLinks, scriptLinks };
            }
          });
  
          const { html, cssLinks, scriptLinks } = result.result;
          const totalFiles = cssLinks.length + scriptLinks.length + 1; // Including the HTML file
          let filesDownloaded = 0;
  
          // Save the main HTML file
          const htmlBlob = new Blob([html], { type: "text/html" });
          const htmlUrl = URL.createObjectURL(htmlBlob);
          await chrome.downloads.download({
            url: htmlUrl,
            filename: "index.html",
          });
          logData.downloaded.push({ type: "HTML", filename: "index.html", status: "success" });
  
          filesDownloaded++;
          progressBar.value = (filesDownloaded / totalFiles) * 100;
  
          // Save CSS files
          for (const link of cssLinks) {
            const result = await handleFileDownload(link, "CSS", "assets/css");
            logData.directories["assets/css"].push(result.filename);
            if (result.success) {
              logData.downloaded.push({ type: "CSS", url: link, filename: result.filename, status: "success" });
            } else {
              logData.skipped.push({ type: "CSS", url: link, reason: result.reason });
            }
            filesDownloaded++;
            progressBar.value = (filesDownloaded / totalFiles) * 100;
          }
  
          // Save JavaScript files
          for (const script of scriptLinks) {
            const directory = script.includes("assets/js") ? "assets/js" : "external/js";
            const result = await handleFileDownload(script, "JS", directory);
            logData.directories[directory].push(result.filename);
            if (result.success) {
              logData.downloaded.push({ type: "JS", url: script, filename: result.filename, status: "success" });
            } else {
              logData.skipped.push({ type: "JS", url: script, reason: result.reason });
            }
            filesDownloaded++;
            progressBar.value = (filesDownloaded / totalFiles) * 100;
          }
  
          // Generate and save log file
          const logBlob = new Blob([JSON.stringify(logData, null, 2)], { type: "application/json" });
          const logUrl = URL.createObjectURL(logBlob);
          await chrome.downloads.download({
            url: logUrl,
            filename: "download_report.json",
          });
  
          statusDiv.innerText = "Download complete! Log saved as 'download_report.json'.";
          progressBar.style.display = "none"; // Hide progress bar after download
        } catch (error) {
          console.error("Error saving page:", error);
          statusDiv.innerText = `Error: ${error.message}`;
          progressBar.style.display = "none"; // Hide progress bar if error occurs
        }
      }
    });
  });
  
  // Helper function to sanitize filenames
  function sanitizeFilename(filename) {
    const invalidChars = /[<>:"/\\|?*\x00-\x1F]/g;
    if (invalidChars.test(filename)) {
      console.log(`[INVALID] Filename: ${filename}`);
      filename = filename.replace(invalidChars, '_');
    } else {
      console.log(`[VALID] Filename: ${filename}`);
    }
    return filename;
  }
  
  // Helper function to download files
  async function handleFileDownload(url, type, directory) {
    const result = { filename: "", success: false, reason: "" };
  
    try {
      const filename = sanitizeFilename(url.split('/').pop());
      result.filename = `${directory}/${filename}`;
      if (url.startsWith("http") || url.startsWith("https")) {
        console.log(`[REMOTE ${type}] Attempting to download: ${url}`);
        await chrome.downloads.download({
          url: url,
          filename: result.filename,
        });
        result.success = true;
      } else {
        console.log(`[LOCAL ${type}] Skipping local file: ${url}`);
        result.reason = "Local files are skipped.";
      }
    } catch (error) {
      console.warn(`[SKIPPED ${type}] Could not download: ${url}. Reason: ${error.message}`);
      result.reason = error.message;
    }
  
    return result;
  }
  