document.getElementById('readerModeBtn').addEventListener('click', () => {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      chrome.tabs.sendMessage(
        tabs[0].id, 
        {action: "toggleReaderMode"},
        (response) => {
          if (response && response.readerModeActive) {
            document.getElementById('readerModeBtn').textContent = "Exit Reader Mode";
          } else {
            document.getElementById('readerModeBtn').textContent = "Enter Reader Mode";
          }
        }
      );
    });
    window.close();
  });
  