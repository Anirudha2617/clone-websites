chrome.action.onClicked.addListener(async (tab) => {
    if (tab && tab.id) {
      try {
        // Get the page source
        const [result] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => document.documentElement.outerHTML
        });
  
        const pageSource = result.result;
  
        // Create a Blob and URL for the HTML content
        const blob = new Blob([pageSource], { type: "text/html" });
        const url = URL.createObjectURL(blob);
  
        // Download the file
        chrome.downloads.download({
          url: url,
          filename: "page-source.html",
          saveAs: true // Prompts the user with a Save As dialog
        });
  
      } catch (error) {
        console.error("Error saving page source:", error);
      }
    }
  });
    //   "default_icon": {
    //     "16": "icon.png",
    //     "48": "icon.png",
    //     "128": "icon.png"
    //   }  