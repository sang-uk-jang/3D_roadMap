import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const pageUrl = process.env.METROLENS_TEST_URL ?? new URL(
  "../../artifacts/guide/gunja-route-guide.html", import.meta.url,
).href;
const browser = await chromium.launch({
  executablePath: process.env.METROLENS_CHROME,
  args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
});
const expectJourney = (page, expected) => page.waitForFunction(
  expression => new RegExp(expression).test(document.querySelector(".journey")?.textContent),
  expected.source,
);
try {
  const errors = [];
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1020 } });
  desktop.on("pageerror", error => errors.push(error.message));
  await desktop.goto(pageUrl);
  const character = desktop.getByRole("button", { name: "캐릭터 시점", exact: true });
  const arrival = desktop.getByRole("button", { name: "도착했어요", exact: true });
  const checkpoint = desktop.locator(".checkpoint-copy");
  await desktop.waitForFunction(() => !document.querySelector(".floor-switch button")?.disabled);
  assert.equal(await character.getAttribute("aria-pressed"), "true");
  const canvas = desktop.getByLabel("회전 가능한 군자역 3D 모델");
  const beforeLook = await canvas.screenshot();
  const bounds = await canvas.boundingBox();
  await desktop.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await desktop.mouse.down();
  await desktop.mouse.move(bounds.x + bounds.width / 2 + 110, bounds.y + bounds.height / 2, { steps: 6 });
  await desktop.mouse.up();
  assert.notDeepEqual(await canvas.screenshot(), beforeLook);
  await desktop.getByRole("button", { name: "시점 초기화", exact: true }).click();
  await desktop.getByRole("button", { name: "재생", exact: true }).click({ timeout: 15000 });
  await desktop.waitForFunction(() => Number(document.querySelector(".scrub").value) === 1000);
  assert.match(await checkpoint.textContent(), /확인 지점 1.*3·4번 출구 합류부/);
  assert.equal(await desktop.getByRole("button", { name: "일시정지", exact: true }).count(), 0);
  const totalCheckpoints = Number((await checkpoint.locator("span").textContent()).split("/").at(-1));
  assert.equal(totalCheckpoints, 4);
  await desktop.locator(".scrub").fill("500");
  if (process.env.METROLENS_SCREENSHOT === "1") {
    await desktop.screenshot({ path: fileURLToPath(new URL(
      "../../artifacts/guide/gunja-stair-walls.png", import.meta.url,
    )), fullPage: true });
  }
  await arrival.click();
  assert.match(await checkpoint.textContent(), /확인 지점 2.*지하 1층 도착 지점/);
  assert.match(await checkpoint.textContent(), /직진해 정면 공용 계단/);
  await desktop.locator(".scrub").fill("500");
  if (process.env.METROLENS_SCREENSHOT === "1") {
    await desktop.screenshot({ path: fileURLToPath(new URL(
      "../../artifacts/guide/gunja-exit-4-straight.png", import.meta.url,
    )), fullPage: true });
  }
  await desktop.getByRole("button", { name: "이 구간 처음", exact: true }).click();
  assert.equal(await desktop.locator(".scrub").inputValue(), "0");
  await desktop.getByRole("button", { name: "전체 지도", exact: true }).click();
  await desktop.getByRole("button", { name: "B2", exact: true }).click();
  assert.equal(await desktop.getByRole("button", { name: "B2", exact: true }).getAttribute("aria-pressed"), "true");
  await desktop.getByRole("button", { name: "전체", exact: true }).click();
  await desktop.getByRole("button", { name: "확대", exact: true }).click();
  await desktop.getByRole("button", { name: "시점 초기화", exact: true }).click();
  assert.match(await desktop.locator(".journey").textContent(), /4번 출구.*아차산/);
  await character.click();
  await arrival.click();
  if (process.env.METROLENS_SCREENSHOT === "1") {
    await desktop.locator(".scrub").fill("390");
    await desktop.screenshot({ path: fileURLToPath(new URL(
      "../../artifacts/guide/gunja-route-preview.png", import.meta.url,
    )), fullPage: true });
  }
  for (let index = 3; index <= totalCheckpoints; index++) {
    assert.match(await checkpoint.textContent(), new RegExp(`확인 지점 ${index} /`));
    await arrival.click();
  }
  assert.match(await checkpoint.textContent(), /목적지 도착 확인 완료/);
  assert.equal(await arrival.count(), 0);
  await desktop.locator(".place select").first().selectOption("l7-park");
  await desktop.locator(".place select").last().selectOption("connector-2-upper");
  await desktop.getByRole("button", { name: "경로 보기", exact: true }).click();
  await expectJourney(desktop, /어린이대공원.*2번 출구/);
  assert.match(await checkpoint.textContent(), /확인 지점 1/);
  await desktop.getByRole("button", { name: "출발지와 목적지 바꾸기", exact: true }).click();
  await desktop.getByRole("button", { name: "경로 보기", exact: true }).click();
  await expectJourney(desktop, /2번 출구.*어린이대공원/);
  await desktop.locator(".place select").last().selectOption("tickets-central");
  await desktop.getByRole("button", { name: "경로 보기", exact: true }).click();
  await expectJourney(desktop, /2번 출구.*중앙 표 사는 곳·카드 충전/);
  await desktop.locator(".place select").first().selectOption("connector-3-upper");
  await desktop.locator(".place select").last().selectOption("connector-4-upper");
  await desktop.getByRole("button", { name: "경로 보기", exact: true }).click();
  await expectJourney(desktop, /3번 출구.*4번 출구/);
  assert.match(await checkpoint.textContent(), /3·4번 출구 합류부.*중간참을 걸어서/);
  await desktop.locator(".place select").first().selectOption("connector-7-upper");
  await desktop.locator(".place select").last().selectOption("connector-8-upper");
  await desktop.getByRole("button", { name: "경로 보기", exact: true }).click();
  await expectJourney(desktop, /7번 출구.*8번 출구/);
  assert.match(await checkpoint.locator("span").textContent(), /확인 지점 1 \/ 2/);
  await desktop.locator(".place select").first().selectOption("connector-8-upper");
  await desktop.locator(".place select").last().selectOption("gates-east");
  await desktop.getByRole("button", { name: "경로 보기", exact: true }).click();
  await expectJourney(desktop, /8번 출구.*개찰구 앞/);
  await arrival.click();
  assert.match(await checkpoint.textContent(), /둥근 타일 기둥과 유리 칸막이/);
  if (process.env.METROLENS_SCREENSHOT === "1") {
    await desktop.locator(".scrub").fill("835");
    await desktop.screenshot({ path: fileURLToPath(new URL(
      "../../artifacts/guide/gunja-gates-walk.png", import.meta.url,
    )), fullPage: true });
  }
  await desktop.locator(".place select").first().selectOption("connector-4-upper");
  await desktop.locator(".place select").last().selectOption("gs25-b1");
  await desktop.getByRole("button", { name: "경로 보기", exact: true }).click();
  await expectJourney(desktop, /4번 출구.*GS25 편의점 유리문 앞/);
  await arrival.click();
  await arrival.click();
  assert.match(await checkpoint.textContent(), /첫 우회전 코너의 GS25 편의점 유리문/);
  if (process.env.METROLENS_SCREENSHOT === "1") {
    await desktop.locator(".scrub").fill("770");
    await desktop.screenshot({ path: fileURLToPath(new URL(
      "../../artifacts/guide/gunja-gs25-landmark.png", import.meta.url,
    )), fullPage: true });
  }

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  mobile.on("pageerror", error => errors.push(error.message));
  await mobile.goto(pageUrl);
  await mobile.getByRole("button", { name: "전체 지도", exact: true }).tap({ timeout: 15000 });
  await mobile.getByRole("button", { name: "B1", exact: true }).tap({ timeout: 15000 });
  assert.equal(await mobile.getByRole("button", { name: "B1", exact: true }).getAttribute("aria-pressed"), "true");
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth), 390);
  await mobile.addInitScript(() => {
    const context = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type?.startsWith("webgl") ? null : context.call(this, type, ...args);
    };
  });
  await mobile.reload();
  await mobile.getByText("3D를 열 수 없어 안내도 이미지로 표시 중").waitFor();
  await mobile.locator(".journey").waitFor();
  assert.ok(await mobile.locator(".fallback svg polyline").last().getAttribute("points"));
  await mobile.getByRole("button", { name: "도착했어요" }).tap();
  assert.match(await mobile.locator(".checkpoint-copy").textContent(), /확인 지점 2/);
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth), 390);
  assert.deepEqual(errors, []);
  console.log("PASS: playback stops for confirmation, ordered checkpoint arrival, destination completion, route reset and camera controls.");
  console.log("PASS: mobile-width 3D controls and route rendering with WebGL disabled.");
} finally {
  await browser.close();
}
