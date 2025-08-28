// On popup open, check if current tab is a YouTube page
document.addEventListener("DOMContentLoaded", async () => {
  setOutput("Checking current tab...");
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    if (!tabs || !tabs.length) {
      setOutput("No tabs found.");
      return;
    }
    const tab = tabs[0];
    if (!tab || !tab.url) {
      setOutput("No active tab detected.");
      return;
    }
    // Try to load cached description for this tab
    chrome.storage.local.get([tab.url], async (result) => {
      console.log('Storage get result:', result); // Debug log
      if (result[tab.url]) {
        setOutput(result[tab.url]);
        return;
      }
      if (/^https:\/\/(www\.)?youtube\.com\/.*/.test(tab.url)) {
        if (confirm("Detected YouTube page. Run playlist extractor?")) {
          setOutput("Running extractor...");
          try {
            // Step 1: Click the "...more" button
            const [clickResult] = await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: clickExpandMoreButton
            });
            setOutput(`Click result for See More: ${clickResult?.result}`);

            // Step 2: Wait briefly for description to expand
            await new Promise((r) => setTimeout(r, 1500));

            // Step 3: Extract the description
            const [descResult] = await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: extractDescription
            });
            const description = descResult?.result || "No description found";
            console.log("Popup got description:", description);
            setOutput(description);
            // Save to storage for this tab URL
            chrome.storage.local.set({ [tab.url]: description }, () => {
              console.log('Storage set complete:', tab.url, description);
            });
          } catch (err) {
            console.error("Error:", err);
            setOutput(`Error: ${err.message}`);
          }
        } else {
          setOutput("Extractor cancelled by user.");
        }
      } else {
        setOutput("Not a YouTube page. Open a YouTube video to use extractor.");
      }
    });
  });
});

function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.get(tabId, (t) => {
      if (t.status === "complete") return resolve();
      const listener = (updatedTabId, info) => {
        if (updatedTabId === tabId && info.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  });
}

// Click the "...more" button
function clickExpandMoreButton() {
  return new Promise((resolve) => {
    let tries = 0;
    const interval = setInterval(() => {
      const btn = document.querySelector("#expand");
      if (btn) {
        btn.click();
        clearInterval(interval);
        resolve("clicked");
      }
      if (tries++ > 20) { // ~10s max wait
        clearInterval(interval);
        resolve("button-not-found");
      }
    }, 500);
  });
}

function extractDescription() {
  const descEl = document.querySelector(
    "span.yt-core-attributed-string--white-space-pre-wrap"
  );
  if (!descEl) {
    console.log("No description found");
    return ["No description found"];
  }

  const results = [];
  const timestampRegex = /^\d{1,2}:\d{2}(?::\d{2})?$/; // matches 0:00, 12:34, 1:23:45

  // Find all spans with <a>
  const spansWithLinks = descEl.querySelectorAll("span:has(a)");

  spansWithLinks.forEach((span) => {
    const link = span.querySelector("a");
    const text = link?.innerText.trim();

    // ✅ only keep if it looks like a timestamp
    if (text && timestampRegex.test(text)) {
      const timestamp = text;
      const nextSpan = span.nextElementSibling;
      let title = nextSpan ? nextSpan.innerText.trim() : "";
      if (title) {
        // ✂️ take only text before the first \n
        title = title.split("\n")[0].trim();
      }
      if (title) {
        results.push(`${timestamp} - ${title}`);
      }
    }
  });

  console.log("Sanitized timestamps:", results);
  return results;
}


// Display helper
function setOutput(text) {
  const el = document.getElementById("output");
  if (!el) return;
  if (Array.isArray(text)) {
    el.innerHTML = `<div class='list-group'>` + text.map((line) => {
      // Expect format: "timestamp - title"
      const match = line.match(/^(\d{1,2}:\d{2}(?::\d{2})?) - (.+)$/);
      if (match) {
        const title = match[2];
        return `
          <div class='list-group-item d-flex justify-content-between align-items-center mb-2'>
            <span><span class='badge bg-primary me-2'>${match[1]}</span> ${title}</span>
            <button type='button' class='btn btn-success btn-sm search-btn' data-title='${encodeURIComponent(title)}'>Search</button>
          </div>
        `;
      } else {
        return `<div class='list-group-item'>${line}</div>`;
      }
    }).join("") + `</div>`;
    // Add event listeners for search buttons
    Array.from(el.querySelectorAll('.search-btn')).forEach(btn => {
      btn.addEventListener('click', function() {
        const title = btn.getAttribute('data-title');
        const url = `https://www.youtube.com/results?search_query=${title}`;
        window.open(url, '_blank');
      });
    });
  } else {
    el.innerHTML = `<div class='alert alert-info'>${text}</div>`;
  }
}
