chrome.runtime.onInstalled.addListener(() => {
  console.log("commit-at installed");
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "commit-complete") {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon128.png",
      title: "commit-at",
      message: message.message || "Scheduled commit completed."
    });
  }
});