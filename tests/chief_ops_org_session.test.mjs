import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

test('AuthGateLoginForm calls router.refresh() after successful authentication', () => {
  const appLayoutSrc = fs.readFileSync(
    path.join(projectRoot, 'src/components/layout/AppLayout.tsx'),
    'utf8'
  );
  const authGateSection = appLayoutSrc.slice(
    appLayoutSrc.indexOf('function AuthGateLoginForm'),
    appLayoutSrc.indexOf('export default function AppLayout')
  );
  assert.match(authGateSection, /if \(stillUnauthorized\)/);
  assert.match(authGateSection, /\} else \{\s*router\.refresh\(\);/);
});

test('PinPadModal authenticates live Supabase PINs (e.g. chief_operations) and refreshes RSC state', () => {
  const pinPadSrc = fs.readFileSync(
    path.join(projectRoot, 'src/components/common/PinPadModal.tsx'),
    'utf8'
  );
  assert.match(pinPadSrc, /useRouter/);
  assert.match(pinPadSrc, /await login\(nextPin\)/);
  assert.match(pinPadSrc, /loginWithPin\(nextPin\)/);
  assert.match(pinPadSrc, /router\.refresh\(\)/);
});

test('AuthContext awaits session cookie sync on login and keeps cookies synced without global Zatout fallback', () => {
  const authCtxSrc = fs.readFileSync(
    path.join(projectRoot, 'src/context/AuthContext.tsx'),
    'utf8'
  );
  assert.match(authCtxSrc, /await setActiveUserSessionAction\(result\.user\)/);
  assert.match(authCtxSrc, /hasActiveUserCookie/);
  assert.match(authCtxSrc, /hasOrgCookie/);
  // Ensure no global fallback to Zatout org ID was introduced for chief_operations
  assert.doesNotMatch(authCtxSrc, /chief_operations.*00000000-0000-0000-0000-000000000001/);
});

test('PortalLandingView invalidates prefetched empty RSC cache via router.refresh() on redirect', () => {
  const portalSrc = fs.readFileSync(
    path.join(projectRoot, 'src/components/modules/PortalLandingView.tsx'),
    'utf8'
  );
  assert.match(portalSrc, /router\.push\('\/dashboard\/warehouse'\);\s*router\.refresh\(\);/);
});

test('Warehouse, Catalog, and History views include defensive client recovery for pre-auth empty SSR payloads', () => {
  const warehouseSrc = fs.readFileSync(
    path.join(projectRoot, 'src/components/modules/WarehouseDashboardView.tsx'),
    'utf8'
  );
  const catalogSrc = fs.readFileSync(
    path.join(projectRoot, 'src/components/modules/CatalogView.tsx'),
    'utf8'
  );
  const historySrc = fs.readFileSync(
    path.join(projectRoot, 'src/components/modules/HistoryView.tsx'),
    'utf8'
  );

  assert.match(warehouseSrc, /recoveredOrgRef/);
  assert.match(warehouseSrc, /data\.warehouses\.length === 0/);
  assert.match(warehouseSrc, /handleWarehouseChange\(targetWh, true\)/);

  assert.match(catalogSrc, /recoveredOrgRef/);
  assert.match(catalogSrc, /getCatalogData\(selectedWarehouseId, activeOrgId\)/);

  assert.match(historySrc, /recoveredOrgRef/);
  assert.match(historySrc, /historyData\.records\.length === 0/);
  assert.match(historySrc, /void refreshHistoryData\(\)/);
});

test('session.ts resolves non-Zatout chief_operations org cleanly and returns null when unauthenticated', () => {
  const sessionSrc = fs.readFileSync(
    path.join(projectRoot, 'src/lib/auth/session.ts'),
    'utf8'
  );
  assert.match(sessionSrc, /if \(isZatoutUser\) \{\s*return userOrg \|\| DEFAULT_ORGANIZATION_ID;\s*\}/);
  assert.match(sessionSrc, /if \(userOrg && userOrg !== 'undefined' && userOrg !== 'null' && parsed\.id !== 'usr-worker'\) \{\s*return userOrg;\s*\}/);
  assert.match(sessionSrc, /return null;\s*\}/);
});
