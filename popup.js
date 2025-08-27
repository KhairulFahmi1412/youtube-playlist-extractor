document.getElementById("checkBtn").addEventListener("click", async () => {
  const link = document.getElementById("ytLink").value.trim();
  if (!link) return;

  setOutput("Opening tab...");

  chrome.tabs.create({ url: link, active: false }, async (tab) => {
    try {
      await waitForTabComplete(tab.id);
      setOutput("Tab loaded, clicking...");

      // Step 1: Click the "...more" button
      const [clickResult] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: clickExpandMoreButton
      });

      setOutput(`Click result: ${clickResult?.result}`);

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

    } catch (err) {
      console.error("Error:", err);
      setOutput(`Error: ${err.message}`);
    }
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
  if (el) el.textContent = text;
}
