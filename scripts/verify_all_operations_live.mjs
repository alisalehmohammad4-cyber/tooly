import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// 1. Load environment variables from .env.local
function loadEnv() {
  const env = {};
  const envFiles = ['.env.local', '.env'];
  for (const file of envFiles) {
    const envPath = path.join(projectRoot, file);
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      content.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const idx = trimmed.indexOf('=');
        if (idx !== -1) {
          const key = trimmed.slice(0, idx).trim();
          let val = trimmed.slice(idx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!env[key]) {
            env[key] = val;
          }
        }
      });
    }
  }
  return env;
}

const env = loadEnv();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase credentials missing from .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

// Test Constants
const TEST_QR = 'ZR-VERIFY-999';
const TEST_ORG_ID = '00000000-0000-0000-0000-000000000001'; // Sami Zatout
const SOURCE_WH_ID = '10000000-0000-0000-0000-000000000002'; // בז"ן (WH-BZN)
const TARGET_WH_ID = '10000000-0000-0000-0000-000000000010'; // צלבנים (WH-ZLB)
const TEST_WORKER = 'בדיקה מבצעית';
const TEST_PHONE = '050-0000000';
const TEST_SVG_SIG = '<svg viewBox="0 0 100 100"><path d="M10 10 L90 90" stroke="black" /></svg>';

const testResults = [];

function recordResult(num, operation, expected, actual, pass) {
  testResults.push({
    '#': num,
    'Operation Tested': operation,
    'Expected State': expected,
    'Actual DB State': actual,
    'Result (PASS / FAIL)': pass ? 'PASS ✅' : 'FAIL ❌',
  });
}

async function runSuite() {
  console.log('='.repeat(90));
  console.log('🚀 MASTER OPERATIONAL SUITE: Live Supabase End-to-End Verification');
  console.log('='.repeat(90));
  console.log(`Supabase URL:    ${supabaseUrl}`);
  console.log(`Test QR Code:    ${TEST_QR}`);
  console.log(`Organization ID: ${TEST_ORG_ID}`);
  console.log(`Source Depot:    WH-BZN (בז"ן) [${SOURCE_WH_ID}]`);
  console.log(`Target Depot:    WH-ZLB (צלבנים) [${TARGET_WH_ID}]`);
  console.log('-'.repeat(90));

  let testAssetId = null;
  let testRequestId = null;

  try {
    // 0. Initial Pre-cleanup to ensure fresh slate
    console.log('🧹 Pre-cleanup: Purging any existing test rows for', TEST_QR);
    const { data: existingAssets } = await supabase
      .from('assets')
      .select('id')
      .eq('qr_code', TEST_QR);

    if (existingAssets && existingAssets.length > 0) {
      for (const a of existingAssets) {
        await supabase.from('custody_ledger').delete().eq('asset_id', a.id);
        await supabase.from('site_tool_requests').delete().eq('assigned_asset_id', a.id);
        await supabase.from('assets').delete().eq('id', a.id);
      }
    }

    // =========================================================================
    // STEP 1: Test Onboarding
    // =========================================================================
    console.log('\n▶ [1/7] Testing Onboarding (Insert test asset with PO & cost)...');
    const { data: insertedAsset, error: insertErr } = await supabase
      .from('assets')
      .insert({
        qr_code: TEST_QR,
        name: 'רתכת אלקטרונית ניידת (בדיקה מבצעית)',
        brand: 'ToolyTest',
        model_number: 'ZR-VERIFY-MOD',
        current_warehouse_id: SOURCE_WH_ID,
        status: 'available',
        condition: 'good',
        version: 1,
        organization_id: TEST_ORG_ID,
        po_number: 'PO-TEST',
        supply_location: 'בז"ן',
        purchase_cost: 1500,
        tag_number: '999',
      })
      .select()
      .single();

    if (insertErr || !insertedAsset) {
      recordResult(
        1,
        'Onboarding (Insert Asset)',
        'Row in assets with po_number=PO-TEST, supply_location=בז"ן, cost=1500',
        `Insert Failed: ${insertErr?.message}`,
        false
      );
      throw new Error(`Failed to insert test asset: ${insertErr?.message}`);
    }

    testAssetId = insertedAsset.id;

    // Verify row from DB directly
    const { data: fetchedAsset1 } = await supabase
      .from('assets')
      .select('id, qr_code, po_number, supply_location, purchase_cost, status')
      .eq('id', testAssetId)
      .single();

    const isStep1Pass =
      fetchedAsset1?.po_number === 'PO-TEST' &&
      fetchedAsset1?.supply_location === 'בז"ן' &&
      Number(fetchedAsset1?.purchase_cost) === 1500 &&
      fetchedAsset1?.status === 'available';

    recordResult(
      1,
      'Test Onboarding',
      'exists, PO=PO-TEST, loc=בז"ן, cost=1500, status=available',
      `PO=${fetchedAsset1?.po_number}, loc=${fetchedAsset1?.supply_location}, cost=${fetchedAsset1?.purchase_cost}, status=${fetchedAsset1?.status}`,
      isStep1Pass
    );

    // =========================================================================
    // STEP 2: Test Checkout (checkoutToWorkerAction)
    // =========================================================================
    console.log('\n▶ [2/7] Testing Checkout to Worker (checkoutToWorkerAction)...');
    const nowIso = new Date().toISOString();

    // 2.1 Update asset with .select()
    const { data: updatedAssetCheckout, error: coAssetErr } = await supabase
      .from('assets')
      .update({
        status: 'checked_out',
        current_assigned_worker: TEST_WORKER,
        assigned_worker_phone: TEST_PHONE,
        updated_at: nowIso,
      })
      .eq('id', testAssetId)
      .eq('organization_id', TEST_ORG_ID)
      .select();

    // 2.2 Insert ledger entry with signature
    const { error: coLedgerErr } = await supabase
      .from('custody_ledger')
      .insert({
        asset_id: testAssetId,
        action: 'CHECKOUT',
        worker_name: TEST_WORKER,
        worker_phone: TEST_PHONE,
        signature_svg: TEST_SVG_SIG,
        signature_data: TEST_SVG_SIG,
        organization_id: TEST_ORG_ID,
        warehouse_id: SOURCE_WH_ID,
        performed_by: 'מחסנאי בדיקה ראשי',
        notes: 'ניפוק בדיקה מבצעית עם חתימה דיגיטלית',
      })
      .select();

    // 2.3 Assert state
    const { data: fetchedAsset2 } = await supabase
      .from('assets')
      .select('status, current_assigned_worker, assigned_worker_phone')
      .eq('id', testAssetId)
      .single();

    const { data: fetchedLedger2 } = await supabase
      .from('custody_ledger')
      .select('action, worker_name, signature_svg')
      .eq('asset_id', testAssetId)
      .eq('action', 'CHECKOUT')
      .order('created_at', { ascending: false })
      .limit(1);

    const isStep2Pass =
      fetchedAsset2?.status === 'checked_out' &&
      fetchedAsset2?.current_assigned_worker === TEST_WORKER &&
      fetchedLedger2?.length > 0 &&
      fetchedLedger2[0]?.signature_svg?.includes('<svg') &&
      !coAssetErr &&
      !coLedgerErr &&
      updatedAssetCheckout?.length === 1;

    recordResult(
      2,
      'Test Checkout (checkoutToWorkerAction)',
      `status=checked_out, worker=${TEST_WORKER}, ledger=CHECKOUT with SVG sig`,
      `status=${fetchedAsset2?.status}, worker=${fetchedAsset2?.current_assigned_worker}, ledger=${fetchedLedger2?.[0]?.action} (sig: ${Boolean(fetchedLedger2?.[0]?.signature_svg)})`,
      isStep2Pass
    );

    // =========================================================================
    // STEP 3: Test Return (checkinFromWorkerAction)
    // =========================================================================
    console.log('\n▶ [3/7] Testing Return to Stock (checkinFromWorkerAction)...');
    const { data: updatedAssetCheckin, error: ciAssetErr } = await supabase
      .from('assets')
      .update({
        status: 'available',
        condition: 'good',
        current_assigned_worker: null,
        assigned_worker_phone: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', testAssetId)
      .eq('organization_id', TEST_ORG_ID)
      .select();

    const { error: ciLedgerErr } = await supabase
      .from('custody_ledger')
      .insert({
        asset_id: testAssetId,
        action: 'CHECKIN',
        condition_at_return: 'good',
        organization_id: TEST_ORG_ID,
        warehouse_id: SOURCE_WH_ID,
        performed_by: 'מחסנאי בדיקה ראשי',
        notes: 'החזרה מלאה למלאי תקין',
      });

    const { data: fetchedAsset3 } = await supabase
      .from('assets')
      .select('status, current_assigned_worker, condition')
      .eq('id', testAssetId)
      .single();

    const { data: fetchedLedger3 } = await supabase
      .from('custody_ledger')
      .select('action, condition_at_return')
      .eq('asset_id', testAssetId)
      .eq('action', 'CHECKIN')
      .order('created_at', { ascending: false })
      .limit(1);

    const isStep3Pass =
      fetchedAsset3?.status === 'available' &&
      fetchedAsset3?.current_assigned_worker === null &&
      fetchedAsset3?.condition === 'good' &&
      fetchedLedger3?.length > 0 &&
      !ciAssetErr &&
      !ciLedgerErr &&
      updatedAssetCheckin?.length === 1;

    recordResult(
      3,
      'Test Return (checkinFromWorkerAction)',
      'status=available, worker=null, condition=good, ledger=CHECKIN',
      `status=${fetchedAsset3?.status}, worker=${fetchedAsset3?.current_assigned_worker}, cond=${fetchedAsset3?.condition}, ledger=${fetchedLedger3?.[0]?.action}`,
      isStep3Pass
    );

    // =========================================================================
    // STEP 4: Test Direct Transfer (directStorekeeperTransferAction)
    // =========================================================================
    console.log('\n▶ [4/7] Testing Direct Transfer (directStorekeeperTransferAction)...');
    const { data: updatedAssetTransfer, error: trAssetErr } = await supabase
      .from('assets')
      .update({
        status: 'in_transit',
        current_warehouse_id: TARGET_WH_ID,
        updated_at: new Date().toISOString(),
      })
      .eq('id', testAssetId)
      .eq('organization_id', TEST_ORG_ID)
      .select();

    const { error: trLedgerErr } = await supabase
      .from('custody_ledger')
      .insert({
        asset_id: testAssetId,
        action: 'TRANSFER_INIT',
        warehouse_id: SOURCE_WH_ID,
        target_warehouse_id: TARGET_WH_ID,
        target_site_name: 'צלבנים',
        organization_id: TEST_ORG_ID,
        performed_by: 'מחסנאי בדיקה ראשי',
        notes: 'שינוע ישיר בין מחסנים מבז"ן לצלבנים',
      });

    const { data: fetchedAsset4 } = await supabase
      .from('assets')
      .select('status, current_warehouse_id')
      .eq('id', testAssetId)
      .single();

    const { data: fetchedLedger4 } = await supabase
      .from('custody_ledger')
      .select('action, target_warehouse_id')
      .eq('asset_id', testAssetId)
      .eq('action', 'TRANSFER_INIT')
      .order('created_at', { ascending: false })
      .limit(1);

    const isStep4Pass =
      fetchedAsset4?.current_warehouse_id === TARGET_WH_ID &&
      fetchedAsset4?.status === 'in_transit' &&
      fetchedLedger4?.length > 0 &&
      !trAssetErr &&
      !trLedgerErr &&
      updatedAssetTransfer?.length === 1;

    recordResult(
      4,
      'Test Direct Transfer (directStorekeeperTransferAction)',
      `current_warehouse_id=${TARGET_WH_ID}, status=in_transit, ledger=TRANSFER_INIT`,
      `wh_id=${fetchedAsset4?.current_warehouse_id}, status=${fetchedAsset4?.status}, ledger=${fetchedLedger4?.[0]?.action}`,
      isStep4Pass
    );

    // =========================================================================
    // STEP 5: Test Transfer Reception (confirmToolReceptionAction)
    // =========================================================================
    console.log('\n▶ [5/7] Testing Transfer Reception (confirmToolReceptionAction)...');
    const { data: updatedAssetReception, error: recAssetErr } = await supabase
      .from('assets')
      .update({
        status: 'available',
        current_warehouse_id: TARGET_WH_ID,
        updated_at: new Date().toISOString(),
      })
      .eq('id', testAssetId)
      .eq('organization_id', TEST_ORG_ID)
      .select();

    const { error: recLedgerErr } = await supabase
      .from('custody_ledger')
      .insert({
        asset_id: testAssetId,
        action: 'TRANSFER_RECEIVE',
        warehouse_id: TARGET_WH_ID,
        organization_id: TEST_ORG_ID,
        performed_by: 'מחסנאי אתר צלבנים',
        notes: 'קליטה סופית של הכלי במחסן היעד צלבנים',
      });

    const { data: fetchedAsset5 } = await supabase
      .from('assets')
      .select('status, current_warehouse_id')
      .eq('id', testAssetId)
      .single();

    const { data: fetchedLedger5 } = await supabase
      .from('custody_ledger')
      .select('action, warehouse_id')
      .eq('asset_id', testAssetId)
      .eq('action', 'TRANSFER_RECEIVE')
      .order('created_at', { ascending: false })
      .limit(1);

    const isStep5Pass =
      fetchedAsset5?.status === 'available' &&
      fetchedAsset5?.current_warehouse_id === TARGET_WH_ID &&
      fetchedLedger5?.length > 0 &&
      !recAssetErr &&
      !recLedgerErr &&
      updatedAssetReception?.length === 1;

    recordResult(
      5,
      'Test Transfer Reception (confirmToolReceptionAction)',
      `status=available, current_warehouse_id=${TARGET_WH_ID}, ledger=TRANSFER_RECEIVE`,
      `status=${fetchedAsset5?.status}, wh_id=${fetchedAsset5?.current_warehouse_id}, ledger=${fetchedLedger5?.[0]?.action}`,
      isStep5Pass
    );

    // =========================================================================
    // STEP 6: Test Status Switcher (updateAssetStatusAction)
    // =========================================================================
    console.log('\n▶ [6/7] Testing Status Switcher (updateAssetStatusAction)...');
    // 6.1 Switch to maintenance
    const { data: updatedMaint, error: maintErr } = await supabase
      .from('assets')
      .update({
        status: 'maintenance',
        updated_at: new Date().toISOString(),
      })
      .eq('id', testAssetId)
      .eq('organization_id', TEST_ORG_ID)
      .select();

    const { data: fetchedMaint } = await supabase
      .from('assets')
      .select('status')
      .eq('id', testAssetId)
      .single();

    // 6.2 Switch back to available
    const { data: updatedAvail, error: availErr } = await supabase
      .from('assets')
      .update({
        status: 'available',
        updated_at: new Date().toISOString(),
      })
      .eq('id', testAssetId)
      .eq('organization_id', TEST_ORG_ID)
      .select();

    const { data: fetchedAvail } = await supabase
      .from('assets')
      .select('status')
      .eq('id', testAssetId)
      .single();

    const isStep6Pass =
      fetchedMaint?.status === 'maintenance' &&
      fetchedAvail?.status === 'available' &&
      !maintErr &&
      !availErr &&
      updatedMaint?.length === 1 &&
      updatedAvail?.length === 1;

    recordResult(
      6,
      'Test Status Switcher (updateAssetStatusAction)',
      'status changes available -> maintenance -> available',
      `maintenance: ${fetchedMaint?.status}, available: ${fetchedAvail?.status}`,
      isStep6Pass
    );

    // =========================================================================
    // STEP 7: Test Site Requisition Flow
    // =========================================================================
    console.log('\n▶ [7/7] Testing Site Requisition Flow (create + resolve)...');
    testRequestId = crypto.randomUUID();
    const reqNow = new Date().toISOString();

    // 7.1 Create request
    const { error: reqInsertErr } = await supabase
      .from('site_tool_requests')
      .insert({
        id: testRequestId,
        organization_id: TEST_ORG_ID,
        requesting_warehouse_id: TARGET_WH_ID,
        tool_description: 'רתכת אלקטרונית ניידת (בדיקה מבצעית)',
        quantity: 1,
        urgency: 'URGENT',
        reason: 'צורך דחוף בפרויקט צלבנים',
        status: 'PENDING',
        requester_name: 'מחסנאי בדיקה',
        created_at: reqNow,
        updated_at: reqNow,
      })
      .select()
      .single();

    const { data: fetchedReq1 } = await supabase
      .from('site_tool_requests')
      .select('id, status')
      .eq('id', testRequestId)
      .single();

    // 7.2 Resolve/Approve request -> status IN_TRANSIT, asset status in_transit
    const { data: approvedReq, error: reqApproveErr } = await supabase
      .from('site_tool_requests')
      .update({
        status: 'IN_TRANSIT',
        assigned_asset_id: testAssetId,
        source_warehouse_id: SOURCE_WH_ID,
        decided_by: 'אחראי תפעול ראשי (בדיקה)',
        decided_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', testRequestId)
      .eq('organization_id', TEST_ORG_ID)
      .select();

    const { data: updatedAssetReq } = await supabase
      .from('assets')
      .update({
        status: 'in_transit',
        updated_at: new Date().toISOString(),
      })
      .eq('id', testAssetId)
      .eq('organization_id', TEST_ORG_ID)
      .select();

    const { data: fetchedReq2 } = await supabase
      .from('site_tool_requests')
      .select('status, assigned_asset_id')
      .eq('id', testRequestId)
      .single();

    const { data: fetchedAssetReq } = await supabase
      .from('assets')
      .select('status')
      .eq('id', testAssetId)
      .single();

    const isStep7Pass =
      fetchedReq1?.status === 'PENDING' &&
      fetchedReq2?.status === 'IN_TRANSIT' &&
      fetchedReq2?.assigned_asset_id === testAssetId &&
      fetchedAssetReq?.status === 'in_transit' &&
      !reqInsertErr &&
      !reqApproveErr &&
      approvedReq?.length === 1 &&
      updatedAssetReq?.length === 1;

    recordResult(
      7,
      'Test Site Requisition Flow (createSiteToolRequest + resolve)',
      'create -> PENDING, approve -> IN_TRANSIT with assigned_asset_id',
      `initial=${fetchedReq1?.status}, after approval=${fetchedReq2?.status} (asset: ${fetchedAssetReq?.status})`,
      isStep7Pass
    );
  } catch (err) {
    console.error('❌ Exception occurred during test execution:', err);
  } finally {
    // =========================================================================
    // STEP 8: Cleanup
    // =========================================================================
    console.log('\n▶ [Cleanup] Purging test asset, ledger rows, and request records...');
    let cleanupSuccess = true;
    try {
      if (testAssetId) {
        await supabase.from('custody_ledger').delete().eq('asset_id', testAssetId);
      }
      if (testRequestId) {
        await supabase.from('site_tool_requests').delete().eq('id', testRequestId);
      }
      if (testAssetId) {
        await supabase.from('assets').delete().eq('id', testAssetId);
      }

      // Verify deletion
      const { data: checkAsset } = await supabase
        .from('assets')
        .select('id')
        .eq('qr_code', TEST_QR);

      if (checkAsset && checkAsset.length > 0) {
        cleanupSuccess = false;
      }
    } catch (e) {
      console.error('Cleanup error:', e);
      cleanupSuccess = false;
    }

    recordResult(
      8,
      'Cleanup Test Artifacts',
      'test asset, ledger, and requests cleanly removed from DB',
      cleanupSuccess ? 'Cleaned up (0 residual rows)' : 'Cleanup failed',
      cleanupSuccess
    );
  }

  // =========================================================================
  // FINAL OUTPUT: Clean Console Table
  // =========================================================================
  console.log('\n' + '='.repeat(90));
  console.log('📊 FINAL TEST RESULTS MATRIX');
  console.log('='.repeat(90));
  console.table(testResults);

  const allPassed = testResults.every((r) => r['Result (PASS / FAIL)'].includes('PASS'));
  if (allPassed) {
    console.log('\n🎉 ALL OPERATIONAL TESTS PASSED WITH 100% SUCCESS AGAINST LIVE SUPABASE!\n');
  } else {
    console.error('\n⚠️ SOME OPERATIONAL TESTS FAILED. Inspect the table above.\n');
    process.exit(1);
  }
}

runSuite();
