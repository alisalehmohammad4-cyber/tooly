'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Html5Qrcode } from 'html5-qrcode';
import {
  CameraOff,
  QrCode,
  Building2,
  Wrench,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Layers,
  ArrowLeft,
  ArrowRight,
  ShieldAlert,
  Loader2,
  Scan,
  UserCheck,
  ShoppingCart,
  Zap,
  KeyRound,
  FileText,
  Lock,
  BookmarkCheck,
  Flashlight,
  Barcode,
  PackagePlus,
  Radio,
  Smartphone,
  Type,
  Camera,
} from 'lucide-react';
import type { Category, Warehouse, AssetCondition } from '@/types/domain';
import {
  checkQrCodeExists,
  onboardAsset,
  getNextAvailableTagNumberAction,
} from '@/app/actions/assets';
import AssetActionModal from '@/components/modules/AssetActionModal';
import BulkCheckoutModal from '@/components/modules/BulkCheckoutModal';
import ToolPassportModal from '@/components/modules/ToolPassportModal';
import {
  getAssetDetailsByQr,
  type ScannedAssetDetails,
} from '@/app/actions/custody';
import { useAuth } from '@/context/AuthContext';
import { RoleHeader, RoleBottomNav } from '@/components/layout/AppLayout';
import WorkerToolCard from '@/components/modules/WorkerToolCard';
import { getCurrentGpsCoordinates } from '@/lib/geo';
import { getCachedAssetByQr, cacheAsset } from '@/lib/offline/offlineDb';
import { useWebNfc } from '@/lib/nfc/useWebNfc';
import { useOcrScanner } from '@/lib/ocr/useOcrScanner';

interface QuickOnboardViewProps {
  categories: Category[];
  warehouses: Warehouse[];
  onReturnToPortal?: () => void;
}

const COMMON_BRANDS = ['DeWalt', 'Milwaukee', 'Makita', 'Bosch', 'Hilti', 'Stihl'];

const getStatusLabel = (status: string) => {
  switch (status) {
    case 'available':
      return 'זמין במלאי';
    case 'checked_out':
      return 'בשימוש';
    case 'maintenance':
      return 'בתיקון / בדיקה';
    default:
      return status;
  }
};

export default function QuickOnboardView({
  categories,
  warehouses,
  onReturnToPortal,
}: QuickOnboardViewProps) {
  const { role, assignedWarehouseId, openPinModal } = useAuth();

  // Scoped Storekeeper check: Locked strictly to assigned facility ("כל אחד של שלו")
  const isStorekeeperScoped =
    (role === 'storekeeper' || role === 'supervisor') && !!assignedWarehouseId;

  // Sticky Warehouse State
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(() => {
    if (isStorekeeperScoped) {
      return assignedWarehouseId;
    }
    return warehouses[0]?.id || '';
  });

  // Sync when storekeeper assignment changes or loads
  useEffect(() => {
    if (isStorekeeperScoped) {
      const timer = setTimeout(() => {
        setSelectedWarehouseId(assignedWarehouseId);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isStorekeeperScoped, assignedWarehouseId]);

  // Category State (Retained across scans)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(
    categories[0]?.id || ''
  );

  // QR Scanner & Input State
  const [qrCode, setQrCode] = useState<string>('');
  const [manualQrInput, setManualQrInput] = useState<string>('');
  const [showManualInput, setShowManualInput] = useState<boolean>(false);
  const [scannerActive, setScannerActive] = useState<boolean>(true);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [isVerifyingQr, setIsVerifyingQr] = useState<boolean>(false);
  const [qrWarning, setQrWarning] = useState<string | null>(null);

  // Storekeeper Streamlined View State (Hide onboarding form by default for high-velocity dispatch)
  const [showOnboardForm, setShowOnboardForm] = useState<boolean>(false);
  const [isSuggestingQr, setIsSuggestingQr] = useState<boolean>(false);

  // Camera Hardware Controls (Torch & Barcode Mode)
  const [isTorchOn, setIsTorchOn] = useState<boolean>(false);
  const [scanMode, setScanMode] = useState<'qr' | 'barcode'>('qr');

  // OCR Text Scanner (Lazy initialization on demand)
  const [isOcrMode, setIsOcrMode] = useState<boolean>(false);
  const [ocrScanFeedback, setOcrScanFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const {
    isInitializing: isOcrInitializing,
    isRecognizing: isOcrRecognizing,
    ocrProgress,
    initOcr,
    recognizeFrame,
  } = useOcrScanner();

  // Web NFC Hook (Android Chrome direct reading/writing & iPhone deep-link support)
  const {
    isSupported: isNfcSupported,
    startScan: startNfcScan,
    stopScan: stopNfcScan,
  } = useWebNfc();
  const [nfcUid, setNfcUid] = useState<string>('');
  const [isReadingNfcForForm, setIsReadingNfcForForm] = useState<boolean>(false);
  const [nfcFormNotice, setNfcFormNotice] = useState<string | null>(null);

  // Tool Form Details
  const [toolName, setToolName] = useState<string>('');
  const [brand, setBrand] = useState<string>('DeWalt');
  const [modelNumber, setModelNumber] = useState<string>('');
  const [condition, setCondition] = useState<AssetCondition>('good');

  // Status & Continuous Loop Feedback
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastEnrolledTool, setLastEnrolledTool] = useState<{
    name: string;
    qrCode: string;
    id: string;
  } | null>(null);
  const [lastActionMessage, setLastActionMessage] = useState<string | null>(null);

  // Scanned Registered Asset (for quick custody modal)
  const [scannedRegisteredAsset, setScannedRegisteredAsset] =
    useState<ScannedAssetDetails | null>(null);
  const [workerUnregisteredWarning, setWorkerUnregisteredWarning] =
    useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isPassportOpen, setIsPassportOpen] = useState<boolean>(false);

  // Bulk Dispatch Cart State
  const [dispatchCart, setDispatchCart] = useState<ScannedAssetDetails[]>([]);
  const [isRapidDispatchMode, setIsRapidDispatchMode] = useState<boolean>(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState<boolean>(false);

  // Scanner References
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isScanningRef = useRef<boolean>(false);
  const lastScannedQrRef = useRef<{ code: string; timestamp: number }>({
    code: '',
    timestamp: 0,
  });

  // Stop scanner instance safely
  const stopScanner = useCallback(async () => {
    if (scannerRef.current && isScanningRef.current) {
      try {
        await scannerRef.current.stop();
      } catch (err) {
        console.warn('Error stopping html5-qrcode scanner:', err);
      } finally {
        isScanningRef.current = false;
        setIsTorchOn(false);
        setScannerActive(false);
      }
    }
  }, []);

  // Automatically fetch and pre-fill next sequential available code (e.g. ZR-1099)
  const handleAutoSuggestNextQr = useCallback(async () => {
    setIsSuggestingQr(true);
    try {
      const nextNum = await getNextAvailableTagNumberAction('ZR-');
      const suggested = `ZR-${nextNum}`;
      setQrCode(suggested);
      setManualQrInput(suggested);
      setQrWarning(null);
    } catch (err) {
      console.warn('Failed to fetch next sequential code:', err);
      setQrCode('ZR-1099');
      setManualQrInput('ZR-1099');
      setQrWarning(null);
    } finally {
      setIsSuggestingQr(false);
    }
  }, []);

  // Open Onboard Form and auto-suggest if no QR was previously scanned
  const handleOpenOnboardForm = useCallback(async () => {
    if (!qrCode.trim()) {
      await handleAutoSuggestNextQr();
    }
    await stopScanner();
    setShowOnboardForm(true);
  }, [qrCode, handleAutoSuggestNextQr, stopScanner]);


  // Toggle Torch on active camera video stream
  const toggleTorch = useCallback(async () => {
    try {
      const videoElem = document.querySelector('#qr-reader video') as HTMLVideoElement | null;
      const stream = videoElem?.srcObject as MediaStream | null;
      const track = stream?.getVideoTracks()[0];
      if (track) {
        const nextState = !isTorchOn;
        await track.applyConstraints({
          advanced: [{ torch: nextState } as MediaTrackConstraintSet & { torch?: boolean }],
        });
        setIsTorchOn(nextState);
      }
    } catch (err) {
      console.warn('Torch toggle not supported or failed on this device:', err);
    }
  }, [isTorchOn]);

  // Toggle between Standard QR (240x240) and Wide 1D Barcode (280x110)
  const handleToggleScanMode = useCallback(async () => {
    const nextMode = scanMode === 'qr' ? 'barcode' : 'qr';
    if (scannerRef.current && isScanningRef.current) {
      try {
        await scannerRef.current.stop();
      } catch (err) {
        console.warn('Error stopping scanner during mode toggle:', err);
      } finally {
        isScanningRef.current = false;
        setIsTorchOn(false);
      }
    }
    setScanMode(nextMode);
  }, [scanMode]);

  // Add asset to dispatch cart
  const handleAddToCart = useCallback((asset: ScannedAssetDetails) => {
    setDispatchCart((prev) => {
      if (prev.some((item) => item.id === asset.id)) {
        setLastActionMessage(`הכלי "${asset.toolName}" כבר קיים בסל הניפוק`);
        return prev;
      }
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate([80, 40, 80]);
        } catch {
          // Vibration not supported
        }
      }
      setLastActionMessage(
        `הכלי "${asset.toolName}" נוסף לסל הניפוק (סה"כ: ${prev.length + 1})`
      );
      return [...prev, asset];
    });
  }, []);

  // Remove single item from dispatch cart
  const handleRemoveFromCart = (assetId: string) => {
    setDispatchCart((prev) => prev.filter((item) => item.id !== assetId));
  };

  // Bulk checkout complete handler
  const handleBulkCheckoutComplete = (message: string) => {
    setDispatchCart([]);
    setLastActionMessage(message);
    setLastEnrolledTool(null);
    setScannedRegisteredAsset(null);
    setQrCode('');
    setManualQrInput('');
    setQrWarning(null);
    setIsBulkModalOpen(false);
    setShowOnboardForm(false);
    setIsTorchOn(false);
    setScannerActive(true);
  };

  // Handle successful QR detection
  const handleScanSuccess = useCallback(
    async (decodedText: string) => {
      const cleanQr = decodedText.trim();
      if (!cleanQr) return;

      const now = Date.now();
      // Debounce duplicate frames of the exact same QR code within 1.5 seconds
      if (
        cleanQr === lastScannedQrRef.current.code &&
        now - lastScannedQrRef.current.timestamp < 1500
      ) {
        return;
      }
      lastScannedQrRef.current = { code: cleanQr, timestamp: now };

      // 1. Haptic feedback for field operator
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate([100, 50, 100]);
        } catch {
          // Vibration not supported or allowed on browser
        }
      }

      try {
        let existing: ScannedAssetDetails | null = null;

        // Check IndexedDB cache first if offline, or attempt network fetch
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          existing = await getCachedAssetByQr(cleanQr);
        } else {
          try {
            existing = await getAssetDetailsByQr(cleanQr);
            if (existing) {
              await cacheAsset(existing);
            }
          } catch (netErr) {
            console.warn('Network call failed, checking local IndexedDB cache:', netErr);
            existing = await getCachedAssetByQr(cleanQr);
          }
        }

        if (existing) {
          // RAPID CONTINUOUS DISPATCH MODE (Supervisor & Admin only):
          if (isRapidDispatchMode && role !== 'worker') {
            if (existing.status === 'available') {
              handleAddToCart(existing);
              // In rapid continuous dispatch, do not stop camera — continue scanning!
              return;
            } else {
              // Asset is checked out or needs repair — pause and alert operator
              await stopScanner();
              setScannedRegisteredAsset(existing);
              setIsModalOpen(true);
              setQrWarning(null);
              return;
            }
          }

          // WORKER MODE -> Show WorkerToolCard directly without custody management modals
          if (role === 'worker') {
            await stopScanner();
            setQrCode(cleanQr);
            setManualQrInput(cleanQr);
            setScannedRegisteredAsset(existing);
            setWorkerUnregisteredWarning(null);
            setQrWarning(null);
            return;
          }

          // SUPERVISOR / ADMIN MODE -> Open custody action modal
          await stopScanner();
          setQrCode(cleanQr);
          setManualQrInput(cleanQr);
          setScannedRegisteredAsset(existing);
          setIsModalOpen(true);
          setQrWarning(null);
          return;
        }

        // TOOL NOT FOUND IN WORKER MODE -> Inform worker to contact storekeeper
        if (role === 'worker') {
          await stopScanner();
          setQrCode(cleanQr);
          setManualQrInput(cleanQr);
          setWorkerUnregisteredWarning(cleanQr);
          setScannedRegisteredAsset(null);
          setQrWarning(null);
          return;
        }

        // TOOL NOT FOUND FOR SUPERVISOR/ADMIN -> Flow to onboarding
        await stopScanner();
        setQrCode(cleanQr);
        setManualQrInput(cleanQr);
        setIsVerifyingQr(true);
        const exists = await checkQrCodeExists(cleanQr);
        if (exists) {
          setQrWarning(`קוד QR "${cleanQr}" כבר רשום במערכת.`);
        } else {
          setQrWarning(null);
        }
        setScannedRegisteredAsset(null);
        setShowOnboardForm(true);
      } catch (err) {
        console.error('Error verifying QR code:', err);
      } finally {
        setIsVerifyingQr(false);
      }
    },
    [isRapidDispatchMode, stopScanner, handleAddToCart, role]
  );

  // Handle Barcode & Text OCR Detections directly into the scan pipeline
  const handleBarcodeDetected = useCallback(
    (detectedCode: string) => {
      handleScanSuccess(detectedCode);
    },
    [handleScanSuccess]
  );

  // Toggle OCR Mode & initialize Tesseract worker lazily on demand
  const handleToggleOcrMode = useCallback(() => {
    setIsOcrMode((prev) => {
      const next = !prev;
      if (next) {
        // Pre-warm OCR worker in background
        void initOcr();
        setOcrScanFeedback({
          type: 'success',
          message: 'מצב סריקת טקסט OCR פעיל. מקם את הטקסט במסגרת ולחץ "סרוק טקסט עכשיו".',
        });
      } else {
        setOcrScanFeedback(null);
      }
      return next;
    });
  }, [initOcr]);

  // Trigger OCR Snapshot Recognition from active camera video feed
  const handleTriggerOcrScan = useCallback(async () => {
    if (isOcrRecognizing || isOcrInitializing) return;

    // Locate the active video element injected by Html5Qrcode into #qr-reader
    const videoElement = document.querySelector<HTMLVideoElement>('#qr-reader video');
    if (!videoElement) {
      setOcrScanFeedback({
        type: 'error',
        message: 'המצלמה אינה פעילה כרגע. ודא שהסורק פתוח ופעיל.',
      });
      return;
    }

    setOcrScanFeedback(null);

    try {
      const recognized = await recognizeFrame(videoElement);
      if (recognized) {
        // Haptic feedback on successful text recognition
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          try {
            navigator.vibrate([100, 50, 100]);
          } catch {
            // ignore if unsupported
          }
        }

        setOcrScanFeedback({
          type: 'success',
          message: `טקסט זוהה בהצלחה: ${recognized}`,
        });

        // Route directly through handleBarcodeDetected just like a normal QR scan
        handleBarcodeDetected(recognized);
      } else {
        setOcrScanFeedback({
          type: 'error',
          message: 'לא זוהה קוד כלי ברור. קרב את המצלמה למספר הכלי ונסה שוב.',
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'שגיאה במהלך סריקת הטקסט';
      setOcrScanFeedback({
        type: 'error',
        message: msg,
      });
    }
  }, [isOcrRecognizing, isOcrInitializing, recognizeFrame, handleBarcodeDetected]);

  // 1. Universal iOS Background NFC Resolver & URL Deep-Link listener (?nfc=... or ?tool=...)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const deepCode = params.get('nfc') || params.get('tool');
    if (deepCode && deepCode.trim()) {
      const clean = deepCode.trim();
      // Clean up URL query parameters without reloading so refresh doesn't re-trigger
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
      // Immediately resolve asset safely outside render cycle
      const timer = setTimeout(() => {
        handleScanSuccess(clean);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [handleScanSuccess]);

  // 2. Android Web NFC Background Auto-Scan when scanner is active
  useEffect(() => {
    if (isNfcSupported && scannerActive && !showOnboardForm && !isReadingNfcForForm) {
      startNfcScan((resolvedCode) => {
        handleScanSuccess(resolvedCode);
      });
    }
    return () => {
      if (!isReadingNfcForForm) {
        stopNfcScan();
      }
    };
  }, [
    isNfcSupported,
    scannerActive,
    showOnboardForm,
    isReadingNfcForForm,
    startNfcScan,
    stopNfcScan,
    handleScanSuccess,
  ]);

  // Synchronize Scanner lifecycle without synchronous effect setState
  useEffect(() => {
    let isCancelled = false;

    if (!qrCode && scannerActive) {
      import('html5-qrcode')
        .then(({ Html5Qrcode }) => {
          if (isCancelled) return;
          const readerElem = document.getElementById('qr-reader');
          if (!readerElem) return;

          if (!scannerRef.current) {
            scannerRef.current = new Html5Qrcode('qr-reader');
          }

          if (!isScanningRef.current) {
            const qrbox =
              scanMode === 'barcode'
                ? { width: 280, height: 110 }
                : { width: 240, height: 240 };

            scannerRef.current
              .start(
                { facingMode: 'environment' },
                {
                  fps: 10,
                  qrbox,
                  aspectRatio: 1.0,
                },
                handleScanSuccess,
                () => {
                  // Non-QR noise frame, ignore
                }
              )
              .then(() => {
                if (!isCancelled) {
                  isScanningRef.current = true;
                }
              })
              .catch((err: unknown) => {
                if (!isCancelled) {
                  isScanningRef.current = false;
                  setScannerActive(false);
                  const msg =
                    err instanceof Error ? err.message : 'לא ניתן להפעיל את המצלמה.';
                  setScannerError(msg);
                }
              });
          }
        })
        .catch((err: unknown) => {
          if (!isCancelled) {
            const msg =
              err instanceof Error ? err.message : 'טעינת רכיב הסורק נכשלה.';
            setScannerError(msg);
          }
        });
    }

    return () => {
      isCancelled = true;
      if (scannerRef.current && isScanningRef.current) {
        scannerRef.current
          .stop()
          .then(() => {
            isScanningRef.current = false;
          })
          .catch(() => {});
      }
    };
  }, [qrCode, scannerActive, handleScanSuccess, scanMode]);

  // Reset QR state and re-open scanner
  const handleReScan = async () => {
    setQrCode('');
    setManualQrInput('');
    setQrWarning(null);
    setSubmitError(null);
    setScannerError(null);
    setScannedRegisteredAsset(null);
    setIsModalOpen(false);
    setShowManualInput(false);
    setShowOnboardForm(false);
    setIsTorchOn(false);
    setScannerActive(true);
  };

  // Callback when custody action completes from modal
  const handleModalActionComplete = (message: string) => {
    setLastActionMessage(message);
    setLastEnrolledTool(null);
    setScannedRegisteredAsset(null);
    setQrCode('');
    setManualQrInput('');
    setQrWarning(null);
    setSubmitError(null);
    setIsModalOpen(false);
    setShowOnboardForm(false);
    setIsTorchOn(false);
    setScannerActive(true);
  };

  // Handle Management (ניהול) button click
  const handleManagementActionClick = useCallback(() => {
    if (role !== 'worker') {
      setIsModalOpen(true);
    } else {
      // If current role is 'worker': do NOT show the worker card.
      // Automatically trigger the Quick PIN Unlock Modal with requested message so the supervisor can enter PIN
      // and immediately proceed with management actions upon successful authorization.
      openPinModal(
        () => {
          setIsModalOpen(true);
        },
        'הזן קוד מנהל עבודה (PIN) לביצוע פעולות ניפוק והחזרה'
      );
    }
  }, [role, openPinModal]);

  // Handle Add to Cart with supervisor role check
  const handleAddToCartClick = useCallback(() => {
    if (!scannedRegisteredAsset) return;
    if (role !== 'worker') {
      handleAddToCart(scannedRegisteredAsset);
      handleReScan();
    } else {
      openPinModal(
        () => {
          handleAddToCart(scannedRegisteredAsset);
          handleReScan();
        },
        'הזן קוד מנהל עבודה (PIN) להוספת כלי לסל ניפוק'
      );
    }
  }, [role, scannedRegisteredAsset, handleAddToCart, openPinModal]);

  // Manual QR input submission
  const handleManualQrSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualQrInput.trim()) return;
    await handleScanSuccess(manualQrInput.trim());
  };

  // Handle Save and loop to next tool
  const handleSubmitAndNext = async () => {
    setSubmitError(null);

    if (!selectedWarehouseId) {
      setSubmitError('אנא בחר מחסן / אתר פעיל.');
      return;
    }
    if (!selectedCategoryId) {
      setSubmitError('אנא בחר קטגוריית כלי.');
      return;
    }
    if (!qrCode) {
      setSubmitError('אנא סרוק או הזן קוד QR תחילה.');
      return;
    }
    if (qrWarning) {
      setSubmitError('לא ניתן לרשום: קוד QR זה כבר רשום במערכת.');
      return;
    }
    if (!toolName.trim()) {
      setSubmitError('שם הכלי הוא שדה חובה (לדוגמה: מברגת אימפקט 18V).');
      return;
    }
    if (!brand.trim()) {
      setSubmitError('שם היצרן / מותג הוא שדה חובה.');
      return;
    }

    setIsSubmitting(true);

    try {
      const gps = await getCurrentGpsCoordinates();

      const result = await onboardAsset({
        warehouseId: selectedWarehouseId,
        categoryId: selectedCategoryId,
        qrCode: qrCode.trim(),
        nfcUid: nfcUid.trim() || undefined,
        toolName: toolName.trim(),
        brand: brand.trim(),
        modelNumber: modelNumber.trim() || undefined,
        condition,
        gps,
      });

      if (!result.success) {
        setSubmitError(result.error);
        setIsSubmitting(false);
        return;
      }

      // Success feedback banner
      setLastEnrolledTool({
        name: toolName.trim(),
        qrCode: qrCode.trim(),
        id: result.assetId,
      });

      // Reset tool-specific fields, retaining warehouse and category
      setToolName('');
      setModelNumber('');
      setQrCode('');
      setNfcUid('');
      setNfcFormNotice(null);
      setManualQrInput('');
      setQrWarning(null);
      setSubmitError(null);
      setIsSubmitting(false);
      setShowOnboardForm(false);

      // Re-activate scanner for the continuous field loop
      setScannerActive(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'רישום הכלי נכשל.';
      setSubmitError(msg);
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`min-h-screen bg-slate-50 text-blue-950 font-sans ${role !== 'worker' ? 'pb-28' : 'pb-6'} selection:bg-blue-600 selection:text-white`}>
      {/* 1. ROLE-ISOLATED TOP BAR & OPTIONAL WAREHOUSE SELECTOR */}
      <RoleHeader
        title={role === 'worker' ? 'Tooly - סורק שטח' : undefined}
        subtitle={role === 'worker' ? 'סורק מהיר' : undefined}
        cartCount={dispatchCart.length}
        onOpenCart={() => setIsBulkModalOpen(true)}
      >
        {/* Sticky Warehouse Selection Dropdown (Only for Storekeeper & Executive) */}
        {role !== 'worker' && (
          <div className="mt-3 max-w-lg mx-auto">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs uppercase font-extrabold text-blue-900 tracking-wider flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-blue-600" />
                אתר / מחסן פעיל
              </label>
              {isStorekeeperScoped && (
                <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 flex items-center gap-1">
                  <Lock className="w-3 h-3 text-amber-600" />
                  משויך למחסנאי (נעול)
                </span>
              )}
            </div>
            <div className="relative">
              <select
                value={selectedWarehouseId}
                disabled={isStorekeeperScoped}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                className={`w-full min-h-[56px] bg-white text-blue-950 font-bold text-base px-4 py-3 rounded-xl border-2 border-blue-200 focus:border-blue-600 focus:outline-none appearance-none transition-colors shadow-sm ${
                  isStorekeeperScoped
                    ? 'cursor-not-allowed bg-slate-100 text-slate-700 border-slate-300 opacity-90'
                    : 'cursor-pointer'
                }`}
              >
                {warehouses.length > 0 ? (
                  warehouses.map((wh) => (
                    <option key={wh.id} value={wh.id} className="bg-white text-blue-950">
                      {wh.code ? `[${wh.code}] ` : ''}
                      {wh.name}
                    </option>
                  ))
                ) : (
                  <option value="" disabled>
                    אין מחסנים פעילים זמינים
                  </option>
                )}
              </select>
              <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-blue-600">
                ▼
              </div>
            </div>
          </div>
        )}
      </RoleHeader>

      <main className="max-w-lg mx-auto px-4 py-4 space-y-5">
        {/* Field Worker: Back to Portal button */}
        {role === 'worker' && onReturnToPortal && (
          <button
            type="button"
            onClick={onReturnToPortal}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-white hover:bg-slate-100 border-2 border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition-all shadow-sm cursor-pointer active:scale-98"
          >
            <ArrowRight className="w-4 h-4 text-blue-600" />
            <span>חזרה לשער הראשי / החלפת עמדה</span>
          </button>
        )}
        {/* CUSTODY ACTION SUCCESS TOAST BANNER */}
        {lastActionMessage && (
          <div className="p-4 rounded-xl bg-emerald-50 border-2 border-emerald-400 flex items-start gap-3 shadow-md animate-in fade-in slide-in-from-top-2 duration-300">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-black text-emerald-800 uppercase tracking-wider">
                פעולת תנועה נרשמה בהצלחה
              </div>
              <div className="text-sm font-bold text-emerald-950 mt-0.5">
                {lastActionMessage}
              </div>
            </div>
          </div>
        )}

        {/* ONBOARD SUCCESS LOOP TOAST BANNER */}
        {lastEnrolledTool && (
          <div className="p-4 rounded-xl bg-emerald-50 border-2 border-emerald-400 flex items-start gap-3 shadow-md animate-in fade-in slide-in-from-top-2 duration-300">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-black text-emerald-800 uppercase tracking-wider">
                הכלי נרשם בהצלחה ומוכן לסריקה הבאה
              </div>
              <div className="text-sm font-bold text-emerald-950 truncate">
                {lastEnrolledTool.name}
              </div>
              <div className="text-xs font-mono text-emerald-700 mt-0.5 font-bold">
                קוד: {lastEnrolledTool.qrCode}
              </div>
            </div>
          </div>
        )}

        {/* 2. SCANNER / BARCODE CAPTURE SECTION */}
        <div className="rounded-2xl border-2 border-blue-100 bg-white p-4 shadow-sm shadow-blue-950/5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-blue-600" />
              <h2 className="text-sm font-black uppercase tracking-wider text-blue-950">
                1. סריקת ברקוד או קוד QR
              </h2>
            </div>
            <div className="flex items-center gap-1.5">
              {/* RAPID CONTINUOUS DISPATCH MODE TOGGLE (Supervisor & Admin only) */}
              {role !== 'worker' && (
                <button
                  type="button"
                  onClick={() => setIsRapidDispatchMode(!isRapidDispatchMode)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-black transition-all border flex items-center gap-1.5 cursor-pointer ${
                    isRapidDispatchMode
                      ? 'bg-amber-100 text-amber-950 border-amber-400 shadow-sm'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-blue-300'
                  }`}
                  title="תפעול מצב סריקה מהירה לסל ניפוק"
                >
                  <Zap
                    className={`w-3.5 h-3.5 ${
                      isRapidDispatchMode ? 'text-amber-600 fill-amber-500' : 'text-slate-400'
                    }`}
                  />
                  <span>{isRapidDispatchMode ? 'ניפוק מהיר: פעיל' : 'ניפוק מרוכז'}</span>
                </button>
              )}

              {qrCode && (
                <button
                  type="button"
                  onClick={handleReScan}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-xs font-bold text-blue-700 border border-blue-200 active:scale-95 transition-all cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  סרוק שוב
                </button>
              )}
            </div>
          </div>

          {/* ACTIVE QR CODE PRESENT */}
          {qrCode ? (
            <div className="space-y-3">
              <div className="p-4 rounded-xl bg-blue-50/60 border-2 border-blue-300 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-10 h-10 rounded-lg bg-blue-600/10 text-blue-600 flex items-center justify-center shrink-0">
                    <QrCode className="w-6 h-6" />
                  </div>
                  <div className="truncate">
                    <div className="text-xs font-bold uppercase tracking-wider text-blue-600">
                      ברקוד / QR שנסרק
                    </div>
                    <div className="text-lg font-mono font-black text-blue-950 truncate" dir="ltr">
                      {qrCode}
                    </div>
                  </div>
                </div>

                {isVerifyingQr ? (
                  <Loader2 className="w-5 h-5 text-blue-600 animate-spin shrink-0" />
                ) : scannedRegisteredAsset ? (
                  <CheckCircle2 className="w-6 h-6 text-blue-600 shrink-0" />
                ) : qrWarning ? (
                  <ShieldAlert className="w-6 h-6 text-red-500 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                )}
              </div>

              {/* REGISTERED ASSET DETECTED BANNER */}
              {scannedRegisteredAsset && (
                <div className="p-4 rounded-xl bg-blue-50 border-2 border-blue-300 flex flex-col gap-3 animate-in fade-in duration-200">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200 inline-block mb-1">
                        כלי רשום במערכת
                      </div>
                      <h3 className="text-base font-black text-blue-950 leading-snug">
                        {scannedRegisteredAsset.toolName}
                      </h3>
                      <div className="text-xs text-blue-800 flex items-center gap-1.5 mt-0.5">
                        <Building2 className="w-3.5 h-3.5 text-blue-600" />
                        <span>{scannedRegisteredAsset.warehouseName}</span>
                      </div>
                    </div>
                    <span className="text-xs font-black px-2.5 py-1 rounded-full bg-blue-100 text-blue-900 border border-blue-300">
                      {scannedRegisteredAsset.status}
                    </span>
                  </div>

                  {/* Lockout / Safety Overdue / Reservation Badges */}
                  {(scannedRegisteredAsset.isLocked ||
                    (scannedRegisteredAsset.safetyInspectionDue &&
                      new Date(scannedRegisteredAsset.safetyInspectionDue).getTime() <
                        new Date().getTime()) ||
                    scannedRegisteredAsset.reservation) && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {scannedRegisteredAsset.isLocked && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded bg-red-100 text-red-800 border border-red-300">
                          <Lock className="w-3 h-3 text-red-600" />
                          כלי נעול מנהלתית
                        </span>
                      )}
                      {scannedRegisteredAsset.safetyInspectionDue &&
                        new Date(scannedRegisteredAsset.safetyInspectionDue).getTime() <
                          new Date().getTime() && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300">
                            <AlertTriangle className="w-3 h-3 text-rose-600" />
                            בדיקת בטיחות פגה
                          </span>
                        )}
                      {scannedRegisteredAsset.reservation && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                          <BookmarkCheck className="w-3 h-3 text-amber-600" />
                          משוריין: {scannedRegisteredAsset.reservation.projectName}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="pt-2 border-t border-blue-200 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleManagementActionClick}
                      className="flex-1 min-h-[50px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-md shadow-blue-600/20 cursor-pointer"
                    >
                      <UserCheck className="w-4 h-4 stroke-[2.5]" />
                      <span>ניהול (ניפוק / החזרה / העברה)</span>
                      {role === 'worker' && (
                        <span className="text-[10px] bg-blue-700/70 border border-blue-400/40 text-blue-100 px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5">
                          <KeyRound className="w-2.5 h-2.5 inline" />
                          <span>PIN</span>
                        </span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsPassportOpen(true)}
                      className="min-h-[50px] px-3.5 rounded-xl bg-white hover:bg-blue-50 text-blue-900 font-bold text-xs border border-blue-300 flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer shadow-sm"
                      title="צפה בדרכון הכלי המלא"
                    >
                      <FileText className="w-4 h-4 text-blue-600" />
                      <span>דרכון כלי</span>
                    </button>

                    {scannedRegisteredAsset.status === 'available' &&
                      !scannedRegisteredAsset.isLocked && (
                        <button
                          type="button"
                          onClick={handleAddToCartClick}
                          className="min-h-[50px] px-3.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black text-xs flex items-center gap-1.5 shadow-md shadow-amber-500/20 active:scale-95 transition-all cursor-pointer"
                          title="הוסף לסל ניפוק וסרוק את הכלי הבא"
                        >
                          <ShoppingCart className="w-4 h-4" />
                          <span>+ הוסף לסל</span>
                        </button>
                      )}

                    <button
                      type="button"
                      onClick={handleReScan}
                      className="min-h-[50px] px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-blue-900 text-xs font-bold border border-slate-300 active:scale-95 transition-all cursor-pointer"
                    >
                      הבא
                    </button>
                  </div>
                </div>
              )}

              {/* DUPLICATE QR WARNING BANNER */}
              {qrWarning && !scannedRegisteredAsset && (
                <div className="p-4 rounded-xl bg-red-50 border-2 border-red-300 flex items-start gap-3">
                  <AlertTriangle className="w-6 h-6 text-red-500 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="text-sm font-black text-red-800 uppercase tracking-wide">
                      קוד QR כבר קיים במערכת
                    </div>
                    <div className="text-xs text-red-700 font-medium mt-0.5">
                      {qrWarning}
                    </div>
                    <button
                      type="button"
                      onClick={handleReScan}
                      className="mt-3 min-h-[48px] w-full px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer shadow-sm"
                    >
                      <RotateCcw className="w-4 h-4" />
                      סרוק קוד אחר
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* CAMERA VIEWFINDER & SCAN BOX */
            <div className="space-y-3">
              {/* Cross-Platform NFC Status Badge */}
              <div className="flex justify-center">
                {isNfcSupported ? (
                  <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-blue-800 text-xs font-bold shadow-xs animate-in fade-in">
                    <Radio className="w-3.5 h-3.5 text-blue-600 animate-pulse shrink-0" />
                    <span>📡 סריקת NFC פעילה (הצמד כלי לגב המכשיר)</span>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold shadow-xs">
                    <Smartphone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span>💡 במכשירי iPhone: הצמד את חלקו העליון של המכשיר לתגית ה-NFC לפתיחה מיידית</span>
                  </div>
                )}
              </div>

              <div className="relative w-full aspect-square max-h-72 rounded-xl overflow-hidden bg-slate-900 border-2 border-blue-200 flex flex-col items-center justify-center shadow-inner">
                <div id="qr-reader" className="w-full h-full" />

                {/* FLOATING CAMERA HARDWARE CONTROLS (Torch, 1D Barcode & OCR Text Scanner) */}
                {scannerActive && !scannerError && (
                  <div className="absolute top-2 inset-x-2 flex flex-wrap items-center justify-between gap-1.5 pointer-events-none z-20">
                    <div className="flex flex-wrap items-center gap-1.5 pointer-events-auto">
                      <button
                        type="button"
                        onClick={handleToggleScanMode}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-900/80 backdrop-blur-md text-white text-[11px] font-bold border border-white/20 flex items-center gap-1.5 shadow-lg active:scale-95 transition-all cursor-pointer hover:bg-slate-800"
                        title="החלף בין סריקת ברקוד רחב (1D) לקוד QR"
                      >
                        {scanMode === 'barcode' ? (
                          <>
                            <Barcode className="w-3.5 h-3.5 text-blue-400" />
                            <span>ברקוד רחב (1D)</span>
                          </>
                        ) : (
                          <>
                            <QrCode className="w-3.5 h-3.5 text-blue-400" />
                            <span>קוד QR</span>
                          </>
                        )}
                      </button>

                      {/* Dedicated OCR Text Scanner Toggle Button */}
                      <button
                        type="button"
                        onClick={handleToggleOcrMode}
                        className={`px-2.5 py-1.5 rounded-lg backdrop-blur-md border flex items-center gap-1.5 shadow-lg active:scale-95 transition-all cursor-pointer ${
                          isOcrMode
                            ? 'bg-amber-500 text-slate-950 border-amber-300 ring-2 ring-amber-400/50'
                            : 'bg-slate-900/80 text-white border-white/20 hover:bg-slate-800'
                        }`}
                        title="זיהוי טקסט OCR (כאשר ה-QR מחוק)"
                      >
                        <Type className={`w-3.5 h-3.5 ${isOcrMode ? 'text-slate-950 stroke-[2.5]' : 'text-amber-400'}`} />
                        <span className="text-[11px] font-bold">
                          {isOcrMode ? '🔤 זיהוי טקסט פעיל' : '🔤 זיהוי טקסט OCR (כאשר ה-QR מחוק)'}
                        </span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={toggleTorch}
                      className={`pointer-events-auto px-2.5 py-1.5 rounded-lg backdrop-blur-md border flex items-center gap-1.5 shadow-lg active:scale-95 transition-all cursor-pointer ${
                        isTorchOn
                          ? 'bg-amber-400 text-slate-950 border-amber-300 ring-2 ring-amber-400/50'
                          : 'bg-slate-900/80 text-white border-white/20 hover:bg-slate-800'
                      }`}
                      title={isTorchOn ? 'כבה פנס' : 'הדלק פנס'}
                    >
                      <Flashlight className={`w-3.5 h-3.5 ${isTorchOn ? 'text-slate-950 fill-slate-950' : 'text-amber-400'}`} />
                      <span className="text-[11px] font-bold">
                        {isTorchOn ? 'פנס דולק' : 'פנס'}
                      </span>
                    </button>
                  </div>
                )}

                {/* Laser Alignment Guide in Barcode Mode */}
                {scanMode === 'barcode' && !isOcrMode && scannerActive && !scannerError && (
                  <div className="absolute inset-x-6 top-1/2 -translate-y-1/2 h-0.5 bg-red-500/80 shadow-[0_0_8px_rgba(239,68,68,0.9)] pointer-events-none z-10 animate-pulse" />
                )}

                {/* Focused Horizontal Text Targeting Bracket & Guidance Overlay in OCR Mode */}
                {isOcrMode && scannerActive && !scannerError && (
                  <div className="absolute inset-0 pointer-events-none z-10 flex flex-col items-center justify-center p-3">
                    <div className="absolute inset-0 bg-slate-950/40" />

                    {/* Focused horizontal targeting bracket */}
                    <div className="relative w-[85%] h-20 rounded-lg border-2 border-amber-400 bg-amber-400/5 shadow-[0_0_20px_rgba(245,158,11,0.5)] flex items-center justify-center z-10">
                      {/* Corner accents */}
                      <div className="absolute -top-1.5 -left-1.5 w-4 h-4 border-t-2 border-l-2 border-amber-300" />
                      <div className="absolute -top-1.5 -right-1.5 w-4 h-4 border-t-2 border-r-2 border-amber-300" />
                      <div className="absolute -bottom-1.5 -left-1.5 w-4 h-4 border-b-2 border-l-2 border-amber-300" />
                      <div className="absolute -bottom-1.5 -right-1.5 w-4 h-4 border-b-2 border-r-2 border-amber-300" />

                      {/* Horizontal laser guidance line */}
                      <div className="w-full h-0.5 bg-amber-400/80 shadow-[0_0_8px_rgba(245,158,11,0.9)] animate-pulse" />
                    </div>

                    {/* Guidance Text */}
                    <div className="relative z-10 mt-3 px-3 py-1.5 rounded-lg bg-slate-950/90 backdrop-blur-sm border border-amber-400/50 text-[11px] font-bold text-amber-200 text-center max-w-[92%] shadow-lg leading-tight">
                      כוון את המסגרת לטקסט המודפס בתחתית המדבקה (לדוגמה: TOOL-001)
                    </div>
                  </div>
                )}

                {scannerError && (
                  <div className="absolute inset-0 bg-white/95 p-6 flex flex-col items-center justify-center text-center space-y-3">
                    <CameraOff className="w-10 h-10 text-blue-600" />
                    <div className="text-sm font-bold text-blue-950">
                      אין גישה למצלמה
                    </div>
                    <p className="text-xs text-slate-600 max-w-xs">
                      {scannerError}. ניתן להזין את הקוד ידנית למטה.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setShowManualInput(true);
                        setScannerError(null);
                        setScannerActive(true);
                      }}
                      className="min-h-[48px] px-4 rounded-xl bg-blue-50 text-blue-700 font-bold text-xs border border-blue-200 flex items-center gap-2 hover:bg-blue-100 cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4" /> נסה שוב
                    </button>
                  </div>
                )}
              </div>

              {/* OCR Action Trigger Button & Status Feedback */}
              {isOcrMode && scannerActive && !scannerError && (
                <div className="space-y-2 pt-1">
                  <button
                    type="button"
                    onClick={handleTriggerOcrScan}
                    disabled={isOcrRecognizing || isOcrInitializing}
                    className={`w-full min-h-[48px] px-4 py-2.5 rounded-xl font-bold text-sm shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      isOcrRecognizing || isOcrInitializing
                        ? 'bg-amber-100 text-amber-900 border border-amber-300 cursor-wait opacity-85'
                        : 'bg-amber-500 hover:bg-amber-600 active:scale-[0.99] text-slate-950 border border-amber-400 shadow-amber-500/20'
                    }`}
                  >
                    {isOcrRecognizing || isOcrInitializing ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin text-amber-900" />
                        <span>
                          {isOcrInitializing
                            ? `מאתחל מנוע OCR (${ocrProgress}%)...`
                            : 'מפענח טקסט מהמצלמה...'}
                        </span>
                      </>
                    ) : (
                      <>
                        <Camera className="w-5 h-5 text-slate-950" />
                        <span>📸 סרוק טקסט עכשיו</span>
                      </>
                    )}
                  </button>

                  {ocrScanFeedback && (
                    <div
                      className={`p-2.5 rounded-lg text-xs font-semibold flex items-center gap-2 border animate-in fade-in duration-200 ${
                        ocrScanFeedback.type === 'success'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-rose-50 text-rose-800 border-rose-200'
                      }`}
                    >
                      {ocrScanFeedback.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      )}
                      <span>{ocrScanFeedback.message}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Manual Input Toggle */}
              <div className="pt-1">
                {showManualInput ? (
                  <form onSubmit={handleManualQrSubmit} className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={manualQrInput}
                        onChange={(e) => setManualQrInput(e.target.value)}
                        placeholder="הזן ברקוד/QR ידנית (למשל TL-99281)"
                        className="flex-1 min-h-[56px] bg-white text-blue-950 font-mono font-bold text-base px-4 rounded-xl border-2 border-blue-200 focus:border-blue-600 focus:outline-none placeholder:text-slate-400 shadow-sm"
                        dir="ltr"
                      />
                      <button
                        type="submit"
                        className="min-h-[56px] px-5 rounded-xl bg-blue-600 text-white font-black text-sm uppercase tracking-wider hover:bg-blue-700 active:scale-95 transition-all shadow-md shadow-blue-600/20 cursor-pointer"
                      >
                        אישור
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowManualInput(true)}
                    className="w-full text-center text-xs font-bold text-blue-600 hover:text-blue-800 underline py-1 cursor-pointer"
                  >
                    לא מצליח לסרוק? הזן ברקוד ידנית
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 3. TOOL DETAILS FORM OR REGISTERED ASSET ACTION */}
        {role === 'worker' ? (
          scannedRegisteredAsset ? (
            <WorkerToolCard
              asset={scannedRegisteredAsset}
              onClose={() => {
                setScannedRegisteredAsset(null);
                setQrCode('');
                setManualQrInput('');
                setScannerActive(true);
              }}
              onDamageReported={(updated) => {
                setScannedRegisteredAsset(updated);
                setLastActionMessage('דיווח התקלה נשלח בהצלחה למחסנאי');
              }}
            />
          ) : workerUnregisteredWarning ? (
            <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/80 p-5 shadow-sm text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto border border-amber-300">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base font-black text-amber-950">
                  קוד QR אינו משויך לכלי במערכת
                </h2>
                <p className="text-xs text-amber-900 max-w-xs mx-auto mt-1 font-medium">
                  הקוד &quot;{workerUnregisteredWarning}&quot; אינו רשום במאגר החברה.
                  עובד שטח אינו מורשה לרשום כלים חדשים. אנא מסור את הכלי למחסנאי לצורך רישום וסימון.
                </p>
              </div>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setWorkerUnregisteredWarning(null);
                    setQrCode('');
                    setManualQrInput('');
                    setScannerActive(true);
                  }}
                  className="w-full min-h-[48px] rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-sm flex items-center justify-center gap-2 shadow-md cursor-pointer transition-all active:scale-95"
                >
                  <Scan className="w-4 h-4" />
                  <span>חזרה לסריקת כלי</span>
                </button>
              </div>
            </div>
          ) : null
        ) : scannedRegisteredAsset ? (
          <div className="rounded-2xl border-2 border-blue-100 bg-white p-5 shadow-sm shadow-blue-950/5 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto border border-blue-100">
              <UserCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-black text-blue-950">
                כלי רשום במערכת &bull; {scannedRegisteredAsset.toolName}
              </h2>
              <p className="text-xs text-blue-800 max-w-xs mx-auto mt-1">
                סטטוס נוכחי: <strong>{getStatusLabel(scannedRegisteredAsset.status)}</strong> ב-
                <strong>{scannedRegisteredAsset.warehouseName}</strong>.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="w-full min-h-[60px] rounded-xl text-white font-black text-base uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl active:scale-95 transition-all cursor-pointer bg-blue-600 hover:bg-blue-700 shadow-blue-600/25"
            >
              <UserCheck className="w-5 h-5 stroke-[2.5]" />
              <span>פעולות תנועה ומשמורת (ניפוק / החזרה / העברה)</span>
            </button>

            <button
              type="button"
              onClick={() => setIsPassportOpen(true)}
              className="w-full min-h-[46px] rounded-xl bg-slate-50 hover:bg-blue-50 text-blue-900 border-2 border-blue-200 text-xs font-black flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-sm"
            >
              <FileText className="w-4 h-4 text-blue-600" />
              <span>כרטיס מכשיר מורחב (דרכון כלי, בדיקות בטיחות ונעילה)</span>
            </button>
          </div>
        ) : !showOnboardForm ? (
          /* DEDICATED HIGH-VELOCITY DISPATCH / CUSTODY SCANNER HUB */
          <div className="rounded-2xl border-2 border-blue-100 bg-white p-5 shadow-sm shadow-blue-950/5 space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 shrink-0">
                  <Scan className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-black uppercase tracking-wider text-blue-950">
                    עמדת סריקה וניפוק פעילה
                  </h2>
                  <p className="text-xs text-slate-500 font-medium">
                    כוון את הסורק לברקוד או QR לפעולת ניפוק, החזרה או בדיקת סטטוס
                  </p>
                </div>
              </div>
            </div>

            {/* High-Velocity Flow Highlights */}
            <div className="grid grid-cols-3 gap-2 pt-1">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
                <div className="text-[10px] font-black uppercase text-blue-600">שלב 1</div>
                <div className="text-xs font-bold text-slate-800 mt-0.5">סריקת כלי</div>
                <div className="text-[10px] text-slate-500 mt-0.5">זיהוי מיידי</div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
                <div className="text-[10px] font-black uppercase text-amber-600">שלב 2</div>
                <div className="text-xs font-bold text-slate-800 mt-0.5">ניפוק / החזרה</div>
                <div className="text-[10px] text-slate-500 mt-0.5">שיוך לעובד</div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
                <div className="text-[10px] font-black uppercase text-emerald-600">שלב 3</div>
                <div className="text-xs font-bold text-slate-800 mt-0.5">חתימה דיגיטלית</div>
                <div className="text-[10px] text-slate-500 mt-0.5">תיעוד ביומן</div>
              </div>
            </div>

            {/* Dedicated Action Button to reveal Onboarding Form */}
            <div className="pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={handleOpenOnboardForm}
                className="w-full min-h-[54px] rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-800 border-2 border-dashed border-blue-300 font-black text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer shadow-sm"
              >
                <PackagePlus className="w-5 h-5 text-blue-600" />
                <span>+ הוסף כלי חדש למלאי (קליטת ציוד)</span>
              </button>
              <p className="text-[11px] text-center text-slate-500 mt-1.5 font-medium">
                * סריקת ברקוד שאינו מוכר תפתח אוטומטית את טופס הקליטה
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border-2 border-blue-100 bg-white p-4 shadow-sm shadow-blue-950/5 space-y-5 animate-in fade-in duration-200">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Wrench className="w-5 h-5 text-blue-600" />
                <h2 className="text-sm font-black uppercase tracking-wider text-blue-950">
                  2. מפרט הכלי החדש (קליטת ציוד)
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowOnboardForm(false);
                  setQrCode('');
                  setManualQrInput('');
                  setQrWarning(null);
                  setScannerActive(true);
                }}
                className="text-xs font-bold text-slate-600 hover:text-blue-950 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
              >
                ביטול וחזרה לסורק
              </button>
            </div>

            {/* 1. EDITABLE QR CODE / SERIAL BARCODE IDENTIFIER */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs uppercase font-extrabold text-blue-900 tracking-wider flex items-center gap-1.5">
                  <Barcode className="w-4 h-4 text-blue-600" />
                  <span>קוד מזהה / תגית ברקוד (QR / Barcode)</span>
                  <span className="text-blue-600">*</span>
                </label>
                <button
                  type="button"
                  onClick={handleAutoSuggestNextQr}
                  disabled={isSuggestingQr}
                  className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 hover:underline cursor-pointer disabled:opacity-50"
                  title="חשב והחל את המספר הסידורי הפנוי הבא ברצף"
                >
                  <RotateCcw className={`w-3 h-3 ${isSuggestingQr ? 'animate-spin' : ''}`} />
                  <span>{isSuggestingQr ? 'מחשב מספר הבא...' : 'החל מספר סידורי פנוי הבא (ZR-XXXX)'}</span>
                </button>
              </div>

              <div className="relative">
                <input
                  type="text"
                  value={qrCode}
                  onChange={async (e) => {
                    const val = e.target.value;
                    setQrCode(val);
                    setManualQrInput(val);
                    if (!val.trim()) {
                      setQrWarning('יש להזין קוד זיהוי או תגית ברקוד.');
                    } else {
                      const exists = await checkQrCodeExists(val.trim());
                      if (exists) {
                        setQrWarning(`קוד ברקוד/QR "${val.trim()}" כבר רשום במערכת.`);
                      } else {
                        setQrWarning(null);
                      }
                    }
                  }}
                  placeholder="לדוגמה: ZR-1099 או סרוק ברקוד יצרן"
                  className={`w-full min-h-[56px] bg-white text-blue-950 font-mono font-bold text-base px-4 rounded-xl border-2 transition-colors placeholder:text-slate-400 shadow-sm ${
                    qrWarning
                      ? 'border-amber-400 focus:border-amber-600'
                      : 'border-blue-200 focus:border-blue-600'
                  } focus:outline-none`}
                  dir="ltr"
                />
              </div>

              {qrWarning ? (
                <div className="flex items-center gap-1.5 mt-1.5 text-xs font-bold text-amber-700 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>{qrWarning}</span>
                </div>
              ) : qrCode ? (
                <p className="text-[11px] text-slate-500 mt-1 font-medium">
                  {qrCode.toUpperCase().startsWith('ZR')
                    ? '✓ מספר סידורי רשמי ברצף החברה (ZR-[מספר]). ניתן לערוך ידנית לברקוד יצרן לפי הצורך.'
                    : '✓ ברקוד חופשי / ברקוד יצרן מקורי. ניתן לעריכה חופשית.'}
                </p>
              ) : (
                <p className="text-[11px] text-amber-600 mt-1 font-bold">
                  * שדה חובה. לא ניתן לרשום כלי ללא קוד מזהה.
                </p>
              )}
            </div>

            {/* SINGLE-TAP CATEGORY SELECTOR */}
            <div>
              <label className="block text-xs uppercase font-extrabold text-blue-900 tracking-wider mb-2 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-blue-600" />
                קטגוריית ציוד
              </label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {categories.map((cat) => {
                  const isSelected = selectedCategoryId === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedCategoryId(cat.id)}
                      className={`min-h-[56px] px-3 py-2 rounded-xl text-sm font-black transition-all flex items-center justify-center text-center border-2 cursor-pointer ${
                        isSelected
                          ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-600/20 scale-[1.02]'
                          : 'bg-slate-50 text-blue-950 border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 active:bg-blue-100'
                      }`}
                    >
                      {cat.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* TOOL NAME INPUT */}
            <div>
              <label className="block text-xs uppercase font-extrabold text-blue-900 tracking-wider mb-1">
                שם הכלי <span className="text-blue-600">*</span>
              </label>
              <input
                type="text"
                value={toolName}
                onChange={(e) => setToolName(e.target.value)}
                placeholder="לדוגמה: פטישון נטען 18V"
                className="w-full min-h-[56px] bg-white text-blue-950 font-bold text-base px-4 rounded-xl border-2 border-blue-200 focus:border-blue-600 focus:outline-none transition-colors placeholder:text-slate-400 shadow-sm"
              />
            </div>

            {/* BRAND SELECTION & RAPID PRESETS */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs uppercase font-extrabold text-blue-900 tracking-wider">
                  יצרן / מותג <span className="text-blue-600">*</span>
                </label>
              </div>
              {/* Quick-tap brand pills */}
              <div className="flex flex-wrap gap-1.5 mb-2">
                {COMMON_BRANDS.map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setBrand(b)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                      brand.toLowerCase() === b.toLowerCase()
                        ? 'bg-blue-600 text-white border-blue-600 font-black shadow-sm'
                        : 'bg-slate-50 text-blue-900 border-slate-200 hover:border-blue-300'
                    }`}
                  >
                    {b}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="שם היצרן / מותג"
                className="w-full min-h-[56px] bg-white text-blue-950 font-bold text-base px-4 rounded-xl border-2 border-blue-200 focus:border-blue-600 focus:outline-none transition-colors placeholder:text-slate-400 shadow-sm"
              />
            </div>

            {/* MODEL NUMBER (OPTIONAL) */}
            <div>
              <label className="block text-xs uppercase font-extrabold text-blue-900 tracking-wider mb-1">
                דגם / מק&quot;ט <span className="text-slate-400 font-normal">(אופציונלי)</span>
              </label>
              <input
                type="text"
                value={modelNumber}
                onChange={(e) => setModelNumber(e.target.value)}
                placeholder="לדוגמה: DCH273B או 2804-20"
                className="w-full min-h-[56px] bg-white text-blue-950 font-bold text-base px-4 rounded-xl border-2 border-blue-200 focus:border-blue-600 focus:outline-none transition-colors placeholder:text-slate-400 shadow-sm"
              />
            </div>

            {/* CONDITION SELECTOR */}
            <div>
              <label className="block text-xs uppercase font-extrabold text-blue-900 tracking-wider mb-2">
                מצב פיזי ראשוני
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { value: 'excellent', label: 'מעולה' },
                    { value: 'good', label: 'טוב' },
                    { value: 'needs_repair', label: 'דורש תיקון' },
                  ] as const
                ).map((cond) => {
                  const isSelected = condition === cond.value;
                  return (
                    <button
                      key={cond.value}
                      type="button"
                      onClick={() => setCondition(cond.value)}
                      className={`min-h-[56px] px-2 rounded-xl text-xs sm:text-sm font-black transition-all border-2 flex items-center justify-center text-center cursor-pointer ${
                        isSelected
                          ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                          : 'bg-slate-50 text-blue-900 border-slate-200 hover:border-blue-300'
                      }`}
                    >
                      {cond.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* NFC TAG BINDING FIELD (OPTIONAL) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs uppercase font-extrabold text-blue-900 tracking-wider">
                  תגית NFC (UID) <span className="text-slate-400 font-normal">(אופציונלי)</span>
                </label>
                {isNfcSupported && (
                  <button
                    type="button"
                    onClick={async () => {
                      setIsReadingNfcForForm(true);
                      setNfcFormNotice('הצמד את תגית ה-NFC לגב המכשיר כעת...');
                      const ok = await startNfcScan((code, rawUid) => {
                        setNfcUid(rawUid || code);
                        setNfcFormNotice('תגית נקראה בהצלחה!');
                        setIsReadingNfcForForm(false);
                        stopNfcScan();
                      });
                      if (!ok) {
                        setIsReadingNfcForForm(false);
                        setNfcFormNotice('לא ניתן היה להפעיל קריאת NFC');
                      }
                    }}
                    disabled={isReadingNfcForForm}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold transition-all cursor-pointer"
                  >
                    <Radio className={`w-3.5 h-3.5 text-blue-600 ${isReadingNfcForForm ? 'animate-pulse' : ''}`} />
                    <span>{isReadingNfcForForm ? 'ממתין להצמדה...' : '📡 קרא תגית מהמכשיר'}</span>
                  </button>
                )}
              </div>

              <input
                type="text"
                value={nfcUid}
                onChange={(e) => setNfcUid(e.target.value)}
                placeholder="לדוגמה: 04:5A:72:B1:C3:40:80 (או לחץ קרא מהמכשיר)"
                className="w-full min-h-[56px] bg-white text-blue-950 font-mono text-sm px-4 rounded-xl border-2 border-blue-200 focus:border-blue-600 focus:outline-none transition-colors placeholder:text-slate-400 shadow-sm"
                dir="ltr"
              />
              {nfcFormNotice && (
                <p className="text-[11px] text-blue-600 font-bold mt-1">
                  {nfcFormNotice}
                </p>
              )}
            </div>

            {/* SUBMIT ERROR BANNER */}
            {submitError && (
              <div className="p-4 rounded-xl bg-red-50 border-2 border-red-300 text-red-800 text-sm font-bold flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            {/* 4. PROMINENT SAVE & SCAN NEXT ACTION BUTTON (MIN 56PX) */}
            <button
              type="button"
              onClick={handleSubmitAndNext}
              disabled={isSubmitting || Boolean(qrWarning) || !qrCode}
              className={`w-full min-h-[64px] rounded-xl font-black text-lg uppercase tracking-wider flex items-center justify-center gap-3 shadow-xl transition-all active:scale-[0.98] cursor-pointer ${
                !qrCode || Boolean(qrWarning)
                  ? 'bg-slate-100 text-slate-400 border-2 border-slate-200 cursor-not-allowed'
                  : isSubmitting
                  ? 'bg-blue-400 text-white cursor-wait'
                  : 'bg-blue-600 hover:bg-blue-700 text-white border-2 border-blue-600 shadow-blue-600/25'
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin text-white" />
                  <span>רושם כלי במערכת...</span>
                </>
              ) : (
                <>
                  <span>שמור וסרוק את הכלי הבא</span>
                  <ArrowLeft className="w-6 h-6 stroke-[3]" />
                </>
              )}
            </button>
          </div>
        )}
      </main>

      {/* DISPATCH CART FLOATING BAR (Supervisor & Admin only) */}
      {role !== 'worker' && dispatchCart.length > 0 && (
        <aside
          aria-label="סל ניפוק כלים"
          className="fixed bottom-20 left-0 right-0 z-40 px-3 pointer-events-none"
        >
          <div className="max-w-lg mx-auto pointer-events-auto bg-blue-950 text-white p-3.5 rounded-2xl shadow-2xl border-2 border-amber-400 flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-3 duration-300">
            <div
              onClick={() => setIsBulkModalOpen(true)}
              className="flex items-center gap-3 min-w-0 cursor-pointer flex-1 select-none hover:opacity-95"
              title="לחץ לפתיחת סל ניפוק כלים ובדיקת אביזרים"
            >
              <div className="relative w-10 h-10 rounded-xl bg-amber-400 text-blue-950 flex items-center justify-center shrink-0 shadow-md font-black">
                <ShoppingCart className="w-5 h-5" />
                <span className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center border border-white shadow">
                  {dispatchCart.length}
                </span>
              </div>
              <div className="min-w-0">
                <div className="text-xs font-black text-amber-300 uppercase tracking-wider flex items-center gap-1">
                  <span>סל ניפוק כלים</span>
                  <span className="text-[10px] bg-amber-400/20 px-1 py-0.5 rounded font-bold">({dispatchCart.length})</span>
                </div>
                <div className="text-xs font-bold text-white truncate">
                  {dispatchCart.map((t) => t.toolName).join(', ')}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setDispatchCart([])}
                className="px-2.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-blue-200 text-xs font-bold transition-colors cursor-pointer"
                title="נקה סל"
              >
                נקה סל
              </button>

              <button
                type="button"
                onClick={() => setIsBulkModalOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-blue-950 text-xs font-black flex items-center gap-1.5 shadow-md shadow-amber-400/20 transition-all active:scale-95 cursor-pointer"
              >
                <span>סל ניפוק (אישור)</span>
                <ArrowLeft className="w-4 h-4 stroke-[3]" />
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* 6. QUICK CUSTODY ACTION MODAL (Check-in, Check-out, Transfer) */}
      <AssetActionModal
        isOpen={isModalOpen}
        asset={scannedRegisteredAsset}
        warehouses={warehouses}
        onClose={() => setIsModalOpen(false)}
        onActionComplete={handleModalActionComplete}
        onAddToCart={handleAddToCart}
        isInCart={dispatchCart.some((i) => i.id === scannedRegisteredAsset?.id)}
      />

      {/* 7. BULK CHECKOUT REVIEW & SIGNATURE MODAL */}
      <BulkCheckoutModal
        isOpen={isBulkModalOpen}
        items={dispatchCart}
        onClose={() => setIsBulkModalOpen(false)}
        onRemoveItem={handleRemoveFromCart}
        onBulkCheckoutComplete={handleBulkCheckoutComplete}
      />

      {/* 8. DIGITAL TOOL PASSPORT MODAL */}
      <ToolPassportModal
        isOpen={isPassportOpen}
        asset={scannedRegisteredAsset}
        onClose={() => setIsPassportOpen(false)}
        onAssetUpdated={(updated) => {
          setScannedRegisteredAsset(updated);
          setLastActionMessage('דרכון הכלי עודכן בהצלחה');
        }}
      />

      {/* 5. ROLE-ISOLATED BOTTOM NAVIGATION BAR */}
      <RoleBottomNav />
    </div>
  );
}
