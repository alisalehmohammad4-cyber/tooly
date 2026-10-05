'use client';

import React, { useState, useId } from 'react';
import {
  X,
  Building2,
  User,
  Warehouse,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Sparkles,
  Hash,
  ShieldCheck,
  Globe2,
  Layers,
  Clock,
  Phone,
  Mail,
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import {
  TenantRegistrationSchema,
  type TenantRegistrationInput,
} from '@/core/tenant/tenantOnboard.schema';
import { registerNewOrganizationAction } from '@/app/actions/organizations';

interface RegisterOrganizationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function RegisterOrganizationModal({
  isOpen,
  onClose,
}: RegisterOrganizationModalProps) {
  const { dir, t } = useLanguage();
  const isRtl = dir === 'rtl';

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // Form State
  const [formData, setFormData] = useState<TenantRegistrationInput>({
    companyName: '',
    slug: '',
    serialPrefix: 'TOOL-',
    defaultCurrency: 'ILS',
    contactPhone: '',
    contactEmail: '',
    adminFullName: '',
    adminUsername: '',
    adminPin: '',
    initialWarehouseName: 'מחסן ראשי',
  });

  const companyNameId = useId();
  const slugId = useId();
  const serialPrefixId = useId();
  const currencyId = useId();
  const contactPhoneId = useId();
  const contactEmailId = useId();
  const adminNameId = useId();
  const adminUsernameId = useId();
  const adminPinId = useId();
  const warehouseNameId = useId();

  if (!isOpen) return null;

  const handleResetAndClose = () => {
    setIsSubmitted(false);
    setIsSubmitting(false);
    setErrorMessage(null);
    setStep(1);
    setFormData({
      companyName: '',
      slug: '',
      serialPrefix: 'TOOL-',
      defaultCurrency: 'ILS',
      contactPhone: '',
      contactEmail: '',
      adminFullName: '',
      adminUsername: '',
      adminPin: '',
      initialWarehouseName: 'מחסן ראשי',
    });
    onClose();
  };

  // Auto-generate slug suggestion from company name if slug hasn't been manually typed
  const handleCompanyNameChange = (val: string) => {
    const updated = { ...formData, companyName: val };
    const autoSlug = val
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    if (!formData.slug || formData.slug === autoSlug.slice(0, formData.slug.length)) {
      if (autoSlug.length >= 2) {
        updated.slug = autoSlug;
      }
    }
    setFormData(updated);
  };

  const handleNextStep1 = () => {
    setErrorMessage(null);
    const step1Schema = TenantRegistrationSchema.pick({
      companyName: true,
      slug: true,
      serialPrefix: true,
      defaultCurrency: true,
      contactPhone: true,
      contactEmail: true,
    });
    const res = step1Schema.safeParse(formData);
    if (!res.success) {
      setErrorMessage(res.error.issues[0]?.message || 'אנא מלא את פרטי החברה בצורה תקינה');
      return;
    }
    setStep(2);
  };

  const handleNextStep2 = () => {
    setErrorMessage(null);
    const step2Schema = TenantRegistrationSchema.pick({
      adminFullName: true,
      adminUsername: true,
      adminPin: true,
    });
    const res = step2Schema.safeParse(formData);
    if (!res.success) {
      setErrorMessage(res.error.issues[0]?.message || 'אנא מלא את פרטי המנהל בצורה תקינה');
      return;
    }
    setStep(3);
  };

  const handleSubmitFinal = async () => {
    setErrorMessage(null);
    const res = TenantRegistrationSchema.safeParse(formData);
    if (!res.success) {
      setErrorMessage(res.error.issues[0]?.message || 'אחד מהשדות אינו תקין');
      return;
    }

    setIsSubmitting(true);
    try {
      const actionResult = await registerNewOrganizationAction(formData);
      if (!actionResult.success) {
        setErrorMessage(actionResult.error || 'נכשלה פתיחת הארגון. אנא נסה שנית.');
        setIsSubmitting(false);
        return;
      }

      // Success: Gated approval workflow - do NOT auto login or redirect!
      setIsSubmitted(true);
      setIsSubmitting(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'שגיאה בלתי צפויה ברישום החברה';
      setErrorMessage(msg);
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md animate-in fade-in duration-200"
      dir={dir}
    >
      <div className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 text-white px-6 py-5 flex items-center justify-between relative overflow-hidden">
          <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-white/10 rounded-full blur-xl pointer-events-none" />
          <div className="flex items-center gap-3 z-10">
            <div className="w-11 h-11 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center text-white shadow-inner">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black tracking-tight">
                  {t('onboarding.title', 'פתיחת ארגון חדש ב-Tooly')}
                </h2>
                <span className="text-[10px] bg-emerald-400 text-slate-950 font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Self-Serve
                </span>
              </div>
              <p className="text-xs text-blue-100 font-medium">
                {t('onboarding.subtitle', 'הקמת מרחב עבודה מבודד, מחסן בסיס וחשבון מנהל ראשי')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={isSubmitted ? handleResetAndClose : onClose}
            disabled={isSubmitting}
            aria-label="סגור חלון"
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer disabled:opacity-50 z-10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Wizard Steps Progress Indicator (Hidden on approval screen) */}
        {!isSubmitted && (
          <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                  step === 1
                    ? 'bg-blue-600 text-white font-black shadow-xs'
                    : step > 1
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-200 text-slate-500'
                }`}
              >
                {step > 1 ? <CheckCircle2 className="w-4 h-4" /> : '1'}
              </div>
              <span className={step === 1 ? 'text-blue-700 font-extrabold' : ''}>
                {t('onboarding.step1', 'פרטי הארגון')}
              </span>
            </div>

            <div className="w-8 h-[2px] bg-slate-200" />

            <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                  step === 2
                    ? 'bg-blue-600 text-white font-black shadow-xs'
                    : step > 2
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-200 text-slate-500'
                }`}
              >
                {step > 2 ? <CheckCircle2 className="w-4 h-4" /> : '2'}
              </div>
              <span className={step === 2 ? 'text-blue-700 font-extrabold' : ''}>
                {t('onboarding.step2', 'מנהל ראשי')}
              </span>
            </div>

            <div className="w-8 h-[2px] bg-slate-200" />

            <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                  step === 3
                    ? 'bg-blue-600 text-white font-black shadow-xs'
                    : 'bg-slate-200 text-slate-500'
                }`}
              >
                3
              </div>
              <span className={step === 3 ? 'text-blue-700 font-extrabold' : ''}>
                {t('onboarding.step3', 'מחסן ואישור')}
              </span>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {errorMessage && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold flex items-start gap-2 animate-in fade-in">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Modal Body / Steps */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {isSubmitted ? (
            /* Approval-Gated Pending Confirmation Screen */
            <div className="py-6 px-2 flex flex-col items-center justify-center text-center space-y-5 animate-in zoom-in-95">
              <div className="relative">
                <div className="w-20 h-20 rounded-3xl bg-amber-50 border-2 border-amber-300 flex items-center justify-center text-amber-600 shadow-xl shadow-amber-500/10">
                  <Clock className="w-10 h-10 animate-pulse" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center border-2 border-white shadow-md">
                  <ShieldCheck className="w-4 h-4" />
                </div>
              </div>

              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-100 border border-amber-300 text-amber-900 text-xs font-black shadow-xs">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-600"></span>
                  </span>
                  <span>סטטוס: ממתין לאישור מנהל ראשי</span>
                </div>
                <h3 className="text-2xl font-black text-slate-900">
                  הבקשה נשלחה בהצלחה וממתינה לאישור!
                </h3>
                <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
                  פרטי החברה והמחסן התקבלו במערכת Tooly. מטעמי אבטחה ובקרת איכות, חשבונך ממתין לאישור הנהלת המערכת לפני הפעלתו.
                </p>
              </div>

              {/* Information Note */}
              <div className="w-full max-w-md p-3.5 rounded-2xl bg-blue-50/90 border border-blue-200 text-blue-900 text-xs flex items-center gap-2.5 text-right font-medium">
                <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
                <span>הודעת אישור תישלח לכתובת האימייל והנייד שהזנת ברגע שהחשבון יופעל.</span>
              </div>

              <div className="w-full max-w-md p-4 rounded-2xl bg-slate-50 border border-slate-200 text-right space-y-2.5 text-xs text-slate-700">
                <div className="font-bold text-slate-900 border-b border-slate-200 pb-2 flex items-center justify-between">
                  <span>סיכום פרטי הרישום</span>
                  <span className="font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 text-[11px]">
                    {formData.slug}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2.5 text-[11px]">
                  <div>
                    <span className="text-slate-400 block">ארגון:</span>
                    <strong className="text-slate-900">{formData.companyName}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">מנהל מבוקש:</span>
                    <strong className="text-slate-900">{formData.adminFullName} ({formData.adminUsername})</strong>
                  </div>
                  {formData.contactPhone ? (
                    <div>
                      <span className="text-slate-400 block">טלפון ליצירת קשר:</span>
                      <strong className="text-slate-900 font-mono">{formData.contactPhone}</strong>
                    </div>
                  ) : null}
                  {formData.contactEmail ? (
                    <div>
                      <span className="text-slate-400 block">אימייל ליצירת קשר:</span>
                      <strong className="text-slate-900 font-mono">{formData.contactEmail}</strong>
                    </div>
                  ) : null}
                  <div>
                    <span className="text-slate-400 block">מחסן פותח:</span>
                    <strong className="text-slate-900">{formData.initialWarehouseName}</strong>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleResetAndClose}
                className="w-full max-w-md py-3 px-6 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm shadow-md shadow-blue-600/25 flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-[0.98]"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>חזרה למסך הכניסה</span>
              </button>
            </div>
          ) : step === 1 ? (
            /* STEP 1: Company Identity & Contact Details */
            <div className="space-y-4 animate-in fade-in-50">
              <div>
                <label
                  htmlFor={companyNameId}
                  className="block text-xs font-bold text-slate-700 mb-1"
                >
                  שם הארגון / החברה: <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    id={companyNameId}
                    type="text"
                    value={formData.companyName}
                    onChange={(e) => handleCompanyNameChange(e.target.value)}
                    placeholder="לדוגמה: אלקטרה תשתיות בע״מ"
                    className="w-full bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 rounded-xl px-4 py-2.5 text-sm outline-none transition-all"
                  />
                  <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              <div>
                <label
                  htmlFor={slugId}
                  className="block text-xs font-bold text-slate-700 mb-1"
                >
                  מזהה ייחודי לכתובת (Slug באנגלית): <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    id={slugId}
                    type="text"
                    value={formData.slug}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''),
                      })
                    }
                    placeholder="electra-infra"
                    className="w-full bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 rounded-xl px-4 py-2.5 text-sm outline-none font-mono transition-all"
                  />
                  <Globe2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                </div>
                <div className="mt-1.5 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-100 flex items-center gap-1.5 text-[11px] text-blue-700 font-mono">
                  <span>כתובת גישה:</span>
                  <span className="font-bold">tooly.app/org/{formData.slug || 'your-slug'}</span>
                </div>
              </div>

              {/* Contact Phone & Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor={contactPhoneId}
                    className="block text-xs font-bold text-slate-700 mb-1"
                  >
                    טלפון ליצירת קשר:
                  </label>
                  <div className="relative">
                    <input
                      id={contactPhoneId}
                      type="tel"
                      value={formData.contactPhone || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          contactPhone: e.target.value,
                          contact_phone: e.target.value,
                        })
                      }
                      placeholder="050-1234567"
                      className="w-full bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 rounded-xl px-4 py-2.5 text-sm outline-none transition-all"
                    />
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor={contactEmailId}
                    className="block text-xs font-bold text-slate-700 mb-1"
                  >
                    אימייל ליצירת קשר:
                  </label>
                  <div className="relative">
                    <input
                      id={contactEmailId}
                      type="email"
                      value={formData.contactEmail || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          contactEmail: e.target.value,
                          contact_email: e.target.value,
                        })
                      }
                      placeholder="office@company.co.il"
                      className="w-full bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 rounded-xl px-4 py-2.5 text-sm outline-none transition-all"
                    />
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor={serialPrefixId}
                    className="block text-xs font-bold text-slate-700 mb-1"
                  >
                    קידומת ברקוד / QR לכלים:
                  </label>
                  <div className="relative">
                    <input
                      id={serialPrefixId}
                      type="text"
                      value={formData.serialPrefix}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          serialPrefix: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''),
                        })
                      }
                      placeholder="TOOL-"
                      className="w-full bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 rounded-xl px-4 py-2.5 text-sm outline-none font-mono font-bold transition-all"
                    />
                    <Hash className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    לדוגמה: {formData.serialPrefix || 'TOOL-'}0001
                  </p>
                </div>

                <div>
                  <label
                    htmlFor={currencyId}
                    className="block text-xs font-bold text-slate-700 mb-1"
                  >
                    מטבע ברירת מחדל:
                  </label>
                  <select
                    id={currencyId}
                    value={formData.defaultCurrency}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        defaultCurrency: e.target.value as 'ILS' | 'USD' | 'EUR' | 'AED' | 'SAR',
                      })
                    }
                    className="w-full bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 rounded-xl px-3 py-2.5 text-sm outline-none transition-all cursor-pointer font-medium"
                  >
                    <option value="ILS">₪ שקל ישראלי (ILS)</option>
                    <option value="USD">$ דולר אמריקאי (USD)</option>
                    <option value="EUR">€ אירו (EUR)</option>
                    <option value="AED">د.إ דירהם אמירתי (AED)</option>
                    <option value="SAR">﷼ ריאל סעודי (SAR)</option>
                  </select>
                </div>
              </div>
            </div>
          ) : step === 2 ? (
            /* STEP 2: Master Administrator Setup */
            <div className="space-y-4 animate-in fade-in-50">
              <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-800 flex items-center gap-2 font-medium">
                <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0" />
                <span>
                  חשבון זה יוגדר כ-<strong>מנכ&quot;ל / מנהל כללי</strong> ויהיה בעל סמכויות מלאות לניהול מחסנים, משתמשים והרשאות בארגון לאחר אישור ההנהלה.
                </span>
              </div>

              <div>
                <label
                  htmlFor={adminNameId}
                  className="block text-xs font-bold text-slate-700 mb-1"
                >
                  שם מלא של המנהל: <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    id={adminNameId}
                    type="text"
                    value={formData.adminFullName}
                    onChange={(e) => setFormData({ ...formData, adminFullName: e.target.value })}
                    placeholder="לדוגמה: רון אהרוני"
                    className="w-full bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 rounded-xl px-4 py-2.5 text-sm outline-none transition-all"
                  />
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              <div>
                <label
                  htmlFor={adminUsernameId}
                  className="block text-xs font-bold text-slate-700 mb-1"
                >
                  שם משתמש להתחברות: <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    id={adminUsernameId}
                    type="text"
                    value={formData.adminUsername}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        adminUsername: e.target.value.replace(/[^a-zA-Z0-9_]/g, ''),
                      })
                    }
                    placeholder="ron_admin"
                    className="w-full bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 rounded-xl px-4 py-2.5 text-sm outline-none font-mono transition-all"
                  />
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  אותיות באנגלית, מספרים או קו תחתון
                </p>
              </div>

              <div>
                <label
                  htmlFor={adminPinId}
                  className="block text-xs font-bold text-slate-700 mb-1"
                >
                  קוד PIN / סיסמה להתחברות מהירה: <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    id={adminPinId}
                    type="password"
                    value={formData.adminPin}
                    onChange={(e) => setFormData({ ...formData, adminPin: e.target.value })}
                    placeholder="לפחות 4 ספרות/תווים"
                    className="w-full bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 rounded-xl px-4 py-2.5 text-sm outline-none tracking-widest transition-all"
                  />
                </div>
              </div>
            </div>
          ) : (
            /* STEP 3: Base Depot & Confirmation */
            <div className="space-y-4 animate-in fade-in-50">
              <div>
                <label
                  htmlFor={warehouseNameId}
                  className="block text-xs font-bold text-slate-700 mb-1"
                >
                  שם מחסן הבסיס הראשי: <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    id={warehouseNameId}
                    type="text"
                    value={formData.initialWarehouseName}
                    onChange={(e) =>
                      setFormData({ ...formData, initialWarehouseName: e.target.value })
                    }
                    placeholder="מחסן ראשי"
                    className="w-full bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 rounded-xl px-4 py-2.5 text-sm outline-none transition-all"
                  />
                  <Warehouse className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  תוכל להוסיף מכולות אתר, עגלות שירות ומחסנים נוספים בהמשך מלוח המנהל.
                </p>
              </div>

              {/* Confirmation Card */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 text-xs">
                <div className="font-extrabold text-slate-900 flex items-center justify-between border-b border-slate-200 pb-2">
                  <span>סיכום פרטי מרחב העבודה</span>
                  <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                    סביבה עצמאית ומבודדת
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-slate-600">
                  <div>
                    <span className="text-slate-400 block">ארגון:</span>
                    <strong className="text-slate-900">{formData.companyName}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">קידומת כלים:</span>
                    <strong className="text-slate-900 font-mono">{formData.serialPrefix}0001</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">מנהל מערכת:</span>
                    <strong className="text-slate-900">
                      {formData.adminFullName} ({formData.adminUsername})
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">מחסן פותח:</span>
                    <strong className="text-slate-900">{formData.initialWarehouseName}</strong>
                  </div>
                  {formData.contactPhone ? (
                    <div>
                      <span className="text-slate-400 block">טלפון ליצירת קשר:</span>
                      <strong className="text-slate-900 font-mono">{formData.contactPhone}</strong>
                    </div>
                  ) : null}
                  {formData.contactEmail ? (
                    <div>
                      <span className="text-slate-400 block">אימייל ליצירת קשר:</span>
                      <strong className="text-slate-900 font-mono">{formData.contactEmail}</strong>
                    </div>
                  ) : null}
                </div>

                <div className="pt-2 border-t border-slate-200 flex items-center gap-2 text-emerald-700 font-bold">
                  <Layers className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    יוגדרו אוטומטית 6 קטגוריות כלים בסיסיות (חשמליים, ידניים, מדידה, בטיחות ועוד).
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer / Navigation Buttons */}
        {!isSubmitted && (
          <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => {
                  setErrorMessage(null);
                  setStep((prev) => (prev > 1 ? ((prev - 1) as 1 | 2) : 1));
                }}
                disabled={isSubmitting}
                className="py-2.5 px-4 rounded-xl border border-slate-300 hover:bg-white text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              >
                {isRtl ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                <span>חזור</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="py-2.5 px-4 rounded-xl border border-slate-200 hover:bg-white text-slate-600 font-bold text-xs transition-all cursor-pointer disabled:opacity-50"
              >
                ביטול
              </button>
            )}

            {step === 1 && (
              <button
                type="button"
                onClick={handleNextStep1}
                className="py-2.5 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs shadow-md shadow-blue-600/20 flex items-center gap-1.5 transition-all cursor-pointer active:scale-[0.98]"
              >
                <span>המשך לשלב הבא</span>
                {isRtl ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            )}

            {step === 2 && (
              <button
                type="button"
                onClick={handleNextStep2}
                className="py-2.5 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs shadow-md shadow-blue-600/20 flex items-center gap-1.5 transition-all cursor-pointer active:scale-[0.98]"
              >
                <span>המשך לאישור ומחסן</span>
                {isRtl ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            )}

            {step === 3 && (
              <button
                type="button"
                onClick={handleSubmitFinal}
                disabled={isSubmitting}
                className="py-2.5 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-xs shadow-md shadow-emerald-600/20 flex items-center gap-2 transition-all cursor-pointer active:scale-[0.98]"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>שולח בקשה לאישור...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>שליחת בקשת הקמת ארגון</span>
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
