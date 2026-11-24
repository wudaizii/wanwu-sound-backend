/// <reference lib="dom" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { frontendFixture } from '../helpers/frontendFixture.ts';

test(
  'the independent H5 reads real PG facts/usage and applies AI only to the matching saved revision',
  { timeout: 180000 },
  async () => {
    const dist = process.env.WANWU_FRONTEND_DIST;
    if (!dist || !dist.startsWith('/'))
      throw new Error('Build the frontend and provide its absolute WANWU_FRONTEND_DIST');
    const fixture = await frontendFixture(dist),
      proof: string[] = [],
      errors: string[] = [],
      calls: { path: string; body: Record<string, unknown>; account: string | undefined }[] = [];
    const output = resolve('artifacts/frontend-cloud-integration');
    let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
    let release: (() => void) | null = null;
    try {
      let executablePath = chromium.executablePath();
      try {
        await access(executablePath);
      } catch {
        if (process.platform !== 'darwin') throw new Error('Install pinned Playwright Chromium');
        executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      }
      browser = await chromium.launch({ headless: true, executablePath, chromiumSandbox: true });
      await mkdir(output, { recursive: true });
      const context = await browser.newContext({
          ignoreHTTPSErrors: true,
          reducedMotion: 'reduce',
          viewport: { width: 1280, height: 1000 },
        }),
        page = await context.newPage();
      page.setDefaultTimeout(15000);
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('request', (request) => {
        if (
          request.method() === 'POST' &&
          /\/works\/[^/]+\/talk$/.test(new URL(request.url()).pathname)
        )
          calls.push({
            path: new URL(request.url()).pathname,
            body: request.postDataJSON(),
            account: request.headers()['if-account-match'],
          });
      });
      await page.goto(fixture.origin + '/create', { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: '登录', exact: true }).click();
      const login = page.getByRole('dialog');
      await login.getByLabel('账号', { exact: true }).fill(fixture.teacher.username);
      await login.getByLabel('密码', { exact: true }).fill(fixture.teacher.password);
      await login.getByRole('button', { name: '登录', exact: true }).click();
      await page.getByText(`当前账号：${fixture.teacher.username}`, { exact: true }).waitFor();
      await page.keyboard.press('Escape');
      await page
        .getByRole('region', { name: '账号音频用量' })
        .getByText(/音频空间预留/)
        .waitFor();
      proof.push('real-cookie-login-and-account-usage');
      await page.getByRole('button', { name: '选择草稿', exact: true }).click();
      await page
        .getByRole('dialog', { name: '我的云端草稿' })
        .getByRole('button', { name: '打开草稿', exact: true })
        .click();
      await page.getByRole('button', { name: '确认继续', exact: true }).click();
      await page
        .getByRole('region', { name: '云端版本核对' })
        .getByText('云端版本 1：1 处声音，成品时长 30 秒。', { exact: true })
        .waitFor();
      await page.getByRole('link', { name: '万物成曲', exact: true }).click();
      await page.getByText('讲解对应云端版本 1。', { exact: true }).waitFor();
      assert.ok(fixture.model.requests.length >= 1);
      assert.ok(calls.length >= 1);
      for (const call of calls) {
        assert.deepEqual(Object.keys(call.body).sort(), ['inputDigest', 'revision']);
        assert.equal(call.account, fixture.teacher.id);
        assert.equal(JSON.stringify(call).includes('仅留本地的声卡名'), false);
      }
      for (const prompt of fixture.model.requests)
        for (const secret of ['仅留本地的声卡名', '测试录音人', '测试地点'])
          assert.equal(prompt.includes(secret), false);
      proof.push('explicit-draft-revision-server-facts-and-anonymous-bound-ai');
      fixture.model.line = '迟到的旧回答。';
      fixture.model.gate = new Promise((done) => {
        release = done;
      });
      await page.getByRole('radio').filter({ hasText: '45秒' }).click();
      await page
        .getByRole('region', { name: '云端版本核对' })
        .getByText(/云端版本 2：/)
        .waitFor();
      await page.waitForFunction(
        () => !document.body.textContent?.includes('讲解对应云端版本 1。'),
      );
      for (let i = 0; fixture.model.requests.length < 2; i++) {
        if (i > 200) throw new Error('AI test request did not start');
        await new Promise((done) => setTimeout(done, 25));
      }
      fixture.model.line = '现在可以多听一遍。';
      fixture.model.gate = null;
      await page.getByRole('radio').filter({ hasText: '20秒' }).click();
      (release as (() => void) | null)?.();
      release = null;
      await page.getByText('讲解对应云端版本 3。', { exact: true }).waitFor();
      assert.equal(await page.getByText('迟到的旧回答。', { exact: true }).count(), 0);
      proof.push('editing-cancels-and-rejects-late-ai-result');
      for (const width of [390, 700, 701, 900, 901, 1280]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate(
          () =>
            new Promise<void>((done) =>
              requestAnimationFrame(() => requestAnimationFrame(() => done())),
            ),
        );
        assert.equal(await page.getByRole('complementary', { name: '云端创作' }).count(), 1);
        const fit = await page.getByRole('region', { name: '账号音频用量' }).evaluate((el) => ({
          within: el.getBoundingClientRect().right <= innerWidth + 1,
          content: el.scrollWidth <= el.clientWidth + 1,
          page: document.documentElement.scrollWidth <= innerWidth + 1,
        }));
        assert.ok(fit.within && fit.content && fit.page, `cloud controls fit ${width}px`);
        if (width === 390 || width === 1280)
          await page.screenshot({ path: join(output, `cloud-controls-${width}.png`) });
      }
      proof.push('mobile-and-breakpoint-controls-fit');
      await page.getByRole('button', { name: '老师账号', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: '退出账号', exact: true }).click();
      await page.getByRole('button', { name: '登录', exact: true }).first().waitFor();
      assert.equal(await page.getByRole('region', { name: '账号音频用量' }).count(), 0);
      assert.equal(await page.getByRole('region', { name: '云端版本核对' }).count(), 0);
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: '登录', exact: true }).first().click();
      const other = page.getByRole('dialog');
      await other.getByLabel('账号', { exact: true }).fill(fixture.other.username);
      await other.getByLabel('密码', { exact: true }).fill(fixture.other.password);
      await other.getByRole('button', { name: '登录', exact: true }).click();
      await page.getByText(`当前账号：${fixture.other.username}`, { exact: true }).waitFor();
      await page.keyboard.press('Escape');
      await page
        .getByRole('region', { name: '账号音频用量' })
        .getByText(/音频空间预留 0 B/)
        .waitFor();
      assert.equal(await page.getByText('仅留本地的声卡名', { exact: true }).count(), 0);
      assert.equal(await page.getByRole('region', { name: '云端版本核对' }).count(), 0);
      proof.push('account-switch-clears-private-facts-usage-and-ai');
      assert.deepEqual(errors, []);
      assert.equal(
        (await fixture.db.pool.query('SELECT count(*)::int AS n FROM accounts')).rows[0].n,
        3,
      );
      await writeFile(
        join(output, 'report.json'),
        JSON.stringify(
          {
            status: 'pass',
            localOnly: true,
            postgresql: true,
            cookie: true,
            model: 'deterministic-test-double-no-paid-call',
            scenarios: proof,
            browser: browser.version(),
            apiBodiesContainOnlyReferences: true,
          },
          null,
          2,
        ) + '\n',
      );
      console.log(
        JSON.stringify({
          status: 'pass',
          scenarios: proof.length,
          localOnly: true,
          paidModelCalls: 0,
        }),
      );
    } catch (error) {
      throw error;
    } finally {
      (release as (() => void) | null)?.();
      try {
        await browser?.close();
      } finally {
        await fixture.close();
      }
    }
  },
);
