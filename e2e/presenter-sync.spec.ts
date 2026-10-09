import type { BrowserContext, Locator, Page } from '@playwright/test';
import {
  test,
  expect,
  fixture,
  openEditor,
  importMarkdown,
  waitForAutosave,
  slideElement,
  expectShown,
  expectHiddenFragment,
} from './support/app';

/**
 * Presenter/audience sync. Both windows live in one browser context, so they
 * share BroadcastChannel and localStorage exactly like two real tabs.
 *
 * Deck (fixtures/sync-deck.md):
 *   1. "Slide One"
 *   2. "Slide Two" + "Fragment Alpha" (fragment 1) + "Fragment Bravo" (fragment 2)
 *   3. "Slide Three"
 */

const SYNC_MSG_KEY = 'cuecard-sync-msg';

async function seedDeck(context: BrowserContext) {
  const editor = await context.newPage();
  await openEditor(editor);
  await importMarkdown(editor, fixture('sync-deck.md'));
  await waitForAutosave(editor, 'E2E Sync Deck');
  await editor.close();
}

async function openPresenter(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto('/?mode=presenter');
  await expect(counter(page)).toHaveText('1 / 3');
  return page;
}

async function openAudience(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto('/?mode=audience');
  return page;
}

/** Presenter slide counter ("N / 3"). */
function counter(presenter: Page): Locator {
  return presenter.getByText(/^\d+ \/ 3$/);
}

/**
 * The presenter's "Current Slide" pane. No accessible handle exists for it
 * (the "Next Slide" preview renders another full slide), so this relies on
 * the CSS-module class name.
 */
function presenterCurrent(presenter: Page): Locator {
  return presenter.locator('[class*="currentSlide"]');
}

async function expectAudienceOn(audience: Page, heading: string) {
  await expect(audience.getByRole('heading', { name: heading })).toBeVisible();
}

async function expectFragments(scope: Locator | Page, visible: { alpha: boolean; bravo: boolean }) {
  const alpha = slideElement(scope, 'Fragment Alpha');
  const bravo = slideElement(scope, 'Fragment Bravo');
  await (visible.alpha ? expectShown(alpha) : expectHiddenFragment(alpha));
  await (visible.bravo ? expectShown(bravo) : expectHiddenFragment(bravo));
}

test.describe('presenter / audience sync', () => {
  test.beforeEach(async ({ context }) => {
    await seedDeck(context);
  });

  test('audience follows slide and fragment steps driven by the keyboard', async ({ context }) => {
    const presenter = await openPresenter(context);
    const audience = await openAudience(context);
    await expectAudienceOn(audience, 'Slide One');

    await presenter.bringToFront();
    await presenter.keyboard.press('ArrowRight');
    await expect(counter(presenter)).toHaveText('2 / 3');
    await expectAudienceOn(audience, 'Slide Two');
    await expectFragments(audience, { alpha: false, bravo: false });
    await expectFragments(presenterCurrent(presenter), { alpha: false, bravo: false });

    await presenter.keyboard.press('ArrowRight');
    await expectFragments(audience, { alpha: true, bravo: false });
    await expectFragments(presenterCurrent(presenter), { alpha: true, bravo: false });

    await presenter.keyboard.press('ArrowRight');
    await expectFragments(audience, { alpha: true, bravo: true });

    await presenter.keyboard.press('ArrowRight');
    await expect(counter(presenter)).toHaveText('3 / 3');
    await expectAudienceOn(audience, 'Slide Three');

    await presenter.keyboard.press('ArrowLeft');
    await expect(counter(presenter)).toHaveText('2 / 3');
    await expectAudienceOn(audience, 'Slide Two');
  });

  test('audience follows the Next / Prev buttons', async ({ context }) => {
    const presenter = await openPresenter(context);
    const audience = await openAudience(context);
    await expectAudienceOn(audience, 'Slide One');

    const next = presenter.getByRole('button', { name: /Next/ });
    const prev = presenter.getByRole('button', { name: /Prev/ });
    await expect(prev).toBeDisabled();

    await next.click();
    await expectAudienceOn(audience, 'Slide Two');
    await next.click();
    await expectFragments(audience, { alpha: true, bravo: false });

    await prev.click();
    await expectFragments(audience, { alpha: false, bravo: false });
    await prev.click();
    await expect(counter(presenter)).toHaveText('1 / 3');
    await expectAudienceOn(audience, 'Slide One');
  });

  test('going back into a slide with fragments shows all of them on both windows', async ({ context }) => {
    const presenter = await openPresenter(context);
    const audience = await openAudience(context);
    await expectAudienceOn(audience, 'Slide One');

    await presenter.bringToFront();
    // 1 -> 2 (frag 0) -> frag 1 -> frag 2 -> 3
    for (let i = 0; i < 4; i++) await presenter.keyboard.press('ArrowRight');
    await expect(counter(presenter)).toHaveText('3 / 3');
    await expectAudienceOn(audience, 'Slide Three');

    await presenter.keyboard.press('ArrowLeft');
    await expect(counter(presenter)).toHaveText('2 / 3');
    await expectFragments(presenterCurrent(presenter), { alpha: true, bravo: true });
    await expectAudienceOn(audience, 'Slide Two');
    await expectFragments(audience, { alpha: true, bravo: true });
  });

  test('an audience window opened late catches up via the request-state handshake', async ({ context }) => {
    const presenter = await openPresenter(context);
    await presenter.keyboard.press('ArrowRight'); // slide 2
    await presenter.keyboard.press('ArrowRight'); // fragment 1
    await expect(counter(presenter)).toHaveText('2 / 3');
    await expectFragments(presenterCurrent(presenter), { alpha: true, bravo: false });

    // Remove the persisted last message so only the live handshake
    // (audience 'request-state' -> presenter 'resync') can deliver the state.
    await presenter.evaluate((key) => localStorage.removeItem(key), SYNC_MSG_KEY);

    const audience = await openAudience(context);
    await expectAudienceOn(audience, 'Slide Two');
    await expectFragments(audience, { alpha: true, bravo: false });
  });

  test('pressing Escape twice ends the show and closes the audience window', async ({ context }) => {
    const presenter = await openPresenter(context);
    // Open the audience the way users do, so window.close() is permitted
    const popupPromise = presenter.waitForEvent('popup');
    await presenter.getByRole('button', { name: 'Audience Window' }).click();
    const audience = await popupPromise;
    await expectAudienceOn(audience, 'Slide One');

    await presenter.bringToFront();
    await presenter.keyboard.press('Escape');
    await expect(presenter.getByRole('alert')).toHaveText('Press Escape again to end the presentation');
    // A single Escape must not end anything
    expect(audience.isClosed()).toBe(false);

    const closed = audience.waitForEvent('close');
    await presenter.keyboard.press('Escape');
    await closed;
    await expect(presenter).not.toHaveURL(/mode=presenter/);
    await expect(presenter.getByRole('button', { name: 'Import', exact: true })).toBeVisible();
  });

  test('reloading the presenter re-syncs the audience', async ({ context }) => {
    const presenter = await openPresenter(context);
    const audience = await openAudience(context);
    await presenter.bringToFront();
    for (let i = 0; i < 4; i++) await presenter.keyboard.press('ArrowRight');
    await expect(counter(presenter)).toHaveText('3 / 3');
    await expectAudienceOn(audience, 'Slide Three');

    await presenter.reload();
    // Whatever the presenter shows after reload, the audience must match it.
    const shown = (await counter(presenter).textContent())!;
    const expected = { '1 / 3': 'Slide One', '2 / 3': 'Slide Two', '3 / 3': 'Slide Three' }[shown.trim()]!;
    await expect(presenterCurrent(presenter).getByRole('heading', { name: expected })).toBeVisible();
    await expectAudienceOn(audience, expected);

    // And navigation keeps flowing after the reload
    await presenter.keyboard.press(shown.startsWith('3') ? 'ArrowLeft' : 'ArrowRight');
    await expect(counter(presenter)).not.toHaveText(shown);
    await expectAudienceOn(audience, 'Slide Two');
  });
});
