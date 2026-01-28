// File: tests/playwright/visual-regression.spec.ts
/**
 * Visual Regression Tests: Capture screenshots of key pages to verify visual parity
 * with the original HRM site design. Run these tests after layout changes to detect
 * unexpected visual regressions.
 *
 * DETERMINISTIC CAPTURE STRATEGY:
 * - Network and DOM idle synchronization before snapshots
 * - Font loading guarantees for consistent rendering
 * - Precise masking of dynamic content using data-testid selectors
 * - Element isolation for scoped component screenshots
 *
 * EXTENSIBILITY:
 * - Add new test scenarios to TEST_SCENARIOS
 * - Add new selectors to COMPONENT_SELECTORS
 * - Add new masking patterns to MASK_PATTERNS
 * - Follow the established patterns for new component tests
 */
import { type BrowserContext, type Page } from '@playwright/test'
import { expect, test } from './fixtures'
import {
  getDynamicContentMasks,
  getHrMasks,
  getTimerMasks,
  setupVisualRegressionTest,
} from './test-helpers'
import { takeDashboardScreenshot, takeScreenshot } from './lib/visual'
import { WAIT_TIMEOUTS } from './lib/waits'

// Test suite configuration
test.describe.configure({ mode: 'serial' })

// Reusable page objects
let dashboardPage: Page
let controlPage: Page
let mockPage: Page
let experimentalPage: Page
let context: BrowserContext

// Configuration for extensible test scenarios
const TEST_SCENARIOS = {
  hrData: {
    bpm: 155,
    zone: 4,
  },
  timerSettings: {
    workDuration: 20,
    restDuration: 10,
  },
} as const

// Centralized component selectors for easy maintenance
const COMPONENT_SELECTORS = {
  hrTile: {
    grid: '[data-testid="hrm-connection-panel"]',
    item: '[data-testid="hr-tile-grid-item"]',
    maxHrPercent: '[data-testid="live-hr-percent"]',
    bpmValue: '[data-testid="bpm-value"]',
    calories: 'text=/KCAL/',
  },
  timer: {
    container: '[data-testid="timer-display-container"]',
    countdown: '[data-testid="timer-countdown"]',
  },
  experimental: {
    cards: '.MuiCard-root',
    workoutSummary: {
      duration: 'text=Duration',
      calories: 'text=Calories Burned',
    },
    zoneDistribution: {
      timeValues: 'text=/\\d+s/',
    },
    heartRateChart: {
      container: '.recharts-responsive-container',
    },
  },
} as const

// Masking patterns for dynamic content
const MASK_PATTERNS = {
  experimental: {
    workoutSummary: (page: Page) => [
      page.locator(COMPONENT_SELECTORS.experimental.workoutSummary.duration)
        .locator('xpath=following-sibling::p'),
      page.locator(COMPONENT_SELECTORS.experimental.workoutSummary.calories)
        .locator('xpath=following-sibling::p'),
    ],
    zoneDistribution: (page: Page) => [
      page.locator(COMPONENT_SELECTORS.experimental.zoneDistribution.timeValues),
    ],
    heartRateChart: (page: Page) => [
      page.locator(COMPONENT_SELECTORS.experimental.heartRateChart.container),
    ],
  },
} as const

// Test suite for Visual Regression
test.describe('Visual Regression Tests', () => {
  // Centralized setup hook
  test.beforeAll(async ({ browser }) => {
    const setup = await setupVisualRegressionTest(browser)
    context = setup.context
    dashboardPage = setup.dashboardPage
    controlPage = setup.controlPage
    mockPage = setup.mockPage
    experimentalPage = setup.experimentalPage
  })

  // Centralized cleanup hook
  test.afterAll(async () => {
    await context?.close()
  })

  // Test cases
  test('Dashboard - main viewer page', async () => {
    await takeDashboardScreenshot(dashboardPage, 'dashboard-viewer.png')
  })

  test('Control Panel - timer and music controls', async () => {
    await takeScreenshot(controlPage, 'control-panel.png')
  })

  test('Mock HRM Client - test data input', async () => {
    await mockPage.getByLabel('Weight (kg)').fill('75')
    await mockPage.getByLabel('Height (cm)').fill('180')
    await mockPage.getByLabel('Gender').fill('female')
    await takeScreenshot(mockPage, 'mock-hrm-client.png')
  })

  test('Dashboard with active timer', async () => {
    const decreaseWorkButton = controlPage.getByRole('button', {
      name: /Decrease Work Duration/i,
    })
    const decreaseRestButton = controlPage.getByRole('button', {
      name: /Decrease Rest Duration/i,
    })

    await decreaseWorkButton.click() // Default 20 -> 15
    await decreaseRestButton.click() // Default 10 -> 5
    await controlPage.click('button:has-text("START")', { force: true })

    await expect(
      controlPage.getByRole('button', { name: 'STOP', exact: true })
    ).toBeVisible()
    await expect(dashboardPage.locator('text=/WORK|REST/')).toBeVisible({
      timeout: WAIT_TIMEOUTS.INFRASTRUCTURE,
    })

    await takeScreenshot(dashboardPage, 'dashboard-active-timer.png', {
      mask: getTimerMasks(dashboardPage),
    })
  })

  test('TimerDisplay on dashboard with HR data', async () => {
    await mockPage.getByLabel('Current BPM').fill('155')
    await mockPage.getByRole('button', { name: 'Zone 4' }).click()
    await expect(dashboardPage.locator('text=Mock User').first()).toBeVisible()

    const timerDisplay = dashboardPage.locator('[data-testid="timer-display-container"]')
    await takeScreenshot(timerDisplay, 'timer-display-with-hr-data.png', {
      mask: getTimerMasks(dashboardPage),
    })
  })

  test.describe('Timer Display Phases', () => {
    // Data-driven test configurations for timer phases
    const timerPhaseTestData = [
      {
        name: 'IDLE Phase',
        setup: async () => {
          if (await controlPage.getByTestId('stop-timer-button').isVisible()) {
            await controlPage.getByTestId('stop-timer-button').click()
          }
        },
        expectedText: null,
        snapshot: 'timer-display-idle.png',
        cleanup: false,
      },
      {
        name: 'PREPARE Phase',
        setup: async () => {
          await controlPage.getByTestId('tabata-mode-button').click()
          await controlPage.getByTestId('start-timer-button').click()
        },
        expectedText: 'GET READY',
        snapshot: 'timer-display-prepare.png',
        cleanup: true,
      },
      {
        name: 'WORK Phase',
        setup: async () => {
          await controlPage.getByTestId('start-timer-button').click()
        },
        expectedText: 'WORK',
        snapshot: 'timer-display-work.png',
        cleanup: true,
      },
      {
        name: 'COOLDOWN Phase',
        setup: async () => {
          if (await controlPage.getByTestId('stop-timer-button').isVisible()) {
            await controlPage.getByTestId('stop-timer-button').click()
          }
        },
        expectedText: null,
        snapshot: 'timer-display-cooldown.png',
        cleanup: false,
      },
    ] as const

    for (const { name, setup, expectedText, snapshot, cleanup } of timerPhaseTestData) {
      test(`TimerDisplay - ${name}`, async () => {
        await setup()
        if (expectedText) {
          await expect(dashboardPage.locator(`text=${expectedText}`)).toBeVisible()
        }

        const timerDisplay = dashboardPage.locator(COMPONENT_SELECTORS.timer.container)
        await takeScreenshot(timerDisplay, snapshot, {
          mask: getTimerMasks(dashboardPage),
        })

        if (cleanup && await controlPage.getByTestId('stop-timer-button').isVisible()) {
          await controlPage.getByTestId('stop-timer-button').click()
        }
      })
    }
  })

  test('HR Tiles grid on dashboard with HR data', async () => {
    await expect(dashboardPage.locator('text=Mock User').first()).toBeVisible()
    const hrTilesGrid = dashboardPage.locator('[data-testid="hrm-connection-panel"]')
    await takeScreenshot(hrTilesGrid, 'hr-tiles-grid-with-data.png', {
      mask: getHrMasks(dashboardPage),
    })
  })

  test.describe('HR Tile Tests', () => {
    test.beforeAll(async () => {
      await mockPage.click('button:has-text("START")')
      await expect(
        mockPage.locator('button:has-text("STOP Streaming")')
      ).toBeVisible()

      await dashboardPage.waitForSelector(COMPONENT_SELECTORS.hrTile.item, {
        timeout: WAIT_TIMEOUTS.LONG,
      })
    })

    // Data-driven test for HR zone layouts
    const zoneTestData = [
      { zone: 1, name: 'Fat Burn', color: 'Grey' },
      { zone: 2, name: 'Cardio', color: 'Blue' },
      { zone: 3, name: 'Tempo', color: 'Green' },
      { zone: 4, name: 'Threshold', color: 'Orange' },
      { zone: 5, name: 'Maximum', color: 'Red' },
    ] as const

    for (const { zone, name, color } of zoneTestData) {
      test(`${color} Zone ${zone} (${name}) HR Tile Layout`, async () => {
        await mockPage.getByRole('button', { name: `Zone ${zone}` }).click()

        const hrTilesGrid = dashboardPage.locator(COMPONENT_SELECTORS.hrTile.grid)
        await takeScreenshot(hrTilesGrid, `hr-tiles-grid-zone-${zone}.png`, {
          maxDiffPixelRatio: 0.05,
          mask: [
            ...getHrMasks(dashboardPage),
          ],
        })
      })
    }
  })

  test.describe('HR Tile - Specific Metric Displays', () => {
    test.beforeAll(async () => {
      // Reset to known state
      if (await mockPage.locator('button:has-text("STOP Streaming")').isVisible()) {
        await mockPage.click('button:has-text("STOP Streaming")')
        await expect(
          mockPage.locator('button:has-text("START")')
        ).toBeVisible()
      }

      await mockPage.getByLabel('Current BPM').fill(String(TEST_SCENARIOS.hrData.bpm))
      await mockPage.getByRole('button', { name: `Zone ${TEST_SCENARIOS.hrData.zone}` }).click()
      await mockPage.click('button:has-text("START")')
      await expect(
        mockPage.locator('button:has-text("STOP Streaming")')
      ).toBeVisible()

      await dashboardPage.waitForSelector(COMPONENT_SELECTORS.hrTile.item, {
        timeout: WAIT_TIMEOUTS.LONG,
      })
    })

    // Data-driven test configurations for metric displays
    const metricTestData = [
      {
        name: 'Max HR Percentage Display',
        getLocator: (base: any) => base.locator(COMPONENT_SELECTORS.hrTile.maxHrPercent),
        snapshot: 'hr-tile-max-hr-percent.png',
        mask: [],
      },
      {
        name: 'BPM Display',
        getLocator: (base: any) => base.locator(COMPONENT_SELECTORS.hrTile.bpmValue).locator('..'),
        snapshot: 'hr-tile-bpm-display.png',
        mask: [],
      },
      {
        name: 'Calories Display',
        getLocator: (base: any) => base.locator(COMPONENT_SELECTORS.hrTile.calories).locator('..'),
        snapshot: 'hr-tile-calories-display.png',
        mask: [COMPONENT_SELECTORS.hrTile.calories],
      },
      {
        name: 'Device Status (Connected)',
        getLocator: (base: any) => base,
        snapshot: 'hr-tile-connected-status.png',
        mask: [
          COMPONENT_SELECTORS.hrTile.bpmValue,
          COMPONENT_SELECTORS.hrTile.maxHrPercent,
        ],
      },
    ] as const

    for (const { name, getLocator, snapshot, mask } of metricTestData) {
      test(`HR Tile - ${name}`, async () => {
        const base = dashboardPage.locator(COMPONENT_SELECTORS.hrTile.item).first()
        const element = getLocator(base)
        await takeScreenshot(element, snapshot, {
          maxDiffPixelRatio: 0.01, // Very tight tolerance for precise component validation
          mask: mask.map(sel => base.locator(sel)),
        })
      })
    }

    test('HR Tile - Device Status (Disconnected)', async () => {
      // Stop streaming to simulate disconnection
      await mockPage.click('button:has-text("STOP Streaming")')
      await expect(
        mockPage.locator('button:has-text("START")')
      ).toBeVisible()

      const firstTile = dashboardPage.locator(COMPONENT_SELECTORS.hrTile.item)
      await takeScreenshot(firstTile, 'hr-tile-disconnected-status.png', {
        maxDiffPixelRatio: 0.05,
        mask: [
          firstTile.locator(COMPONENT_SELECTORS.hrTile.bpmValue),
          firstTile.locator(COMPONENT_SELECTORS.hrTile.maxHrPercent),
        ],
      })

      // Restart for subsequent tests
      await mockPage.click('button:has-text("START")')
      await expect(
        mockPage.locator('button:has-text("STOP Streaming")')
      ).toBeVisible()
    })
  })

  test.describe('Experimental Analytics Components', () => {
    test('WorkoutSummary component', async () => {
      // Assuming timer and HR are running from previous tests
      const workoutSummary = experimentalPage.locator(COMPONENT_SELECTORS.experimental.cards).nth(0)
      await takeScreenshot(workoutSummary, 'workout-summary.png', {
        mask: [
          workoutSummary.locator('text=Duration').locator('xpath=following-sibling::p'),
          workoutSummary.locator('text=Calories Burned').locator('xpath=following-sibling::p'),
        ],
      })
    })

    test('ZoneDistribution component', async () => {
      const zoneDist = experimentalPage.locator(COMPONENT_SELECTORS.experimental.cards).nth(1)
      await takeScreenshot(zoneDist, 'zone-distribution.png', {
        mask: [
          zoneDist.locator('text=/\\d+s/'), // Mask time values like "10s"
        ],
      })
    })

    test('HeartRateTimeSeries chart', async () => {
      const hrChart = experimentalPage.locator(COMPONENT_SELECTORS.experimental.cards).nth(2)
      await takeScreenshot(hrChart, 'heart-rate-time-series.png', {
        mask: [
          hrChart.locator('.recharts-responsive-container'), // Mask the entire chart area
        ],
      })
    })
  })
})
