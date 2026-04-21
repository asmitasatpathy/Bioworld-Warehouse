let codeReader = null;
let scannerRunning = false;
let currentScanTarget = null;
let scanLocked = false;
let lastScannedValue = "";

function getScannerElements() {
  if (currentScanTarget === "packerTote" || currentScanTarget === "packerSku") {
    return {
      video: document.getElementById("packerScannerPreview"),
      status: document.getElementById("packerScannerStatus"),
      box: document.getElementById("packerScannerBox")
    };
  }

  return {
    video: document.getElementById("scannerPreview"),
    status: document.getElementById("scannerStatus"),
    box: document.querySelector("#pickingWorkflow .scanner-box")
  };
}

function startCameraScanner(target) {
  currentScanTarget = target;

  const { video, status, box } = getScannerElements();
  if (!video || !status) return;

  if (box) box.style.display = "block";

  if (scannerRunning) {
    status.textContent = "Scanner already running.";
    return;
  }

  codeReader = new ZXing.BrowserMultiFormatReader();

  codeReader.listVideoInputDevices()
    .then(devices => {
      if (!devices.length) {
        status.textContent = "No camera found.";
        return;
      }

      scannerRunning = true;
      scanLocked = false;
      lastScannedValue = "";
      status.textContent = "Camera started. Point QR code at camera.";

      return codeReader.decodeFromVideoDevice(devices[0].deviceId, video.id, (result) => {
        if (!result) return;

        const scannedText = String(result.getText() || "").trim();
        if (!scannedText) return;
        if (scanLocked && scannedText === lastScannedValue) return;

        scanLocked = true;
        lastScannedValue = scannedText;
        status.textContent = "Scanned: " + scannedText;

        if (currentScanTarget === "sku") {
          document.getElementById("manualSkuInput").value = scannedText;
          stopCameraScanner();
          setTimeout(() => validateSku(), 200);
        }

        if (currentScanTarget === "carrier") {
          document.getElementById("manualToteInput").value = scannedText;
          stopCameraScanner();
          setTimeout(() => validateTote(), 200);
        }

        if (currentScanTarget === "packerTote") {
          document.getElementById("packerToteInput").value = scannedText;
          stopCameraScanner();
          setTimeout(() => setPackerTote(), 200);
        }

        if (currentScanTarget === "packerSku") {
          document.getElementById("packerSkuInput").value = scannedText;
          stopCameraScanner();
          setTimeout(() => verifyPackerSku(), 200);
        }

        setTimeout(() => {
          scanLocked = false;
        }, 1500);
      });
    })
    .catch(error => {
      console.error(error);
      status.textContent = "Unable to access camera.";
    });
}

function stopCameraScanner() {
  const { status, box } = getScannerElements();

  if (codeReader) {
    codeReader.reset();
  }

  codeReader = null;
  scannerRunning = false;
  currentScanTarget = null;

  if (status) {
    status.textContent = "Scanner stopped.";
  }

  if (box && box.id === "packerScannerBox") {
    box.style.display = "none";
  }
}