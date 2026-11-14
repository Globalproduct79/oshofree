import { expect, test } from '@playwright/test'
import { CAMPAIGN_FORM_COPY as F } from '@/lib/copy-campaign-form'
import { STATUS_LABEL } from '@/lib/copy-components'
import { HOME } from '@/lib/copy-home'
import { NOTIFY } from '@/lib/copy-notifications'
import { CAMPAIGN_COPY, PREVIEW_COPY } from '@/lib/copy-report'
import { SHELL } from '@/lib/copy-shell'
import {
  ADMIN, approveCampaign, box, homeCard, metricValue, signIn, submitCampaign, TUNDE, type NewCampaign,
} from './helpers'

// F1: Tunde creates "Harmattan sale" as a Wall card and submits it; it waits in review; Global approves it
// from the queue; Tunde's home shows it Live and the bell says so.

const HARMATTAN: NewCampaign = {
  name: 'Harmattan sale',
  headline: 'Harmattan sale: 20% off 1L bottles',
  description: 'Show your claim code at any participating store for 20% off a 1L Kola Bright.',
  budgetUsd: 120,
}

test('F1: a brand previews and submits a Wall card, Global approves it, and it is live on Phoenix', async ({ browser }) => {
  const tunde = await (await browser.newContext()).newPage()
  const admin = await (await browser.newContext()).newPage()

  await test.step('the form previews the Wall card as the Phoenix user sees it', async () => {
    await signIn(tunde, TUNDE)
    await tunde.goto('/app/campaigns/new')
    await tunde.getByLabel(F.fields.headline.label).fill(HARMATTAN.headline)
    const preview = box(tunde, F.previewBox.title)
    await expect(preview.getByText(HARMATTAN.headline, { exact: true })).toBeVisible()
    await expect(preview.getByText(F.placements.card.pill, { exact: true })).toBeVisible()
    // "See it on Phoenix": the card among the offers live in Nigeria now.
    await tunde.getByRole('button', { name: F.buttons.preview }).click()
    const phoenix = tunde.getByRole('dialog', { name: PREVIEW_COPY.title })
    await expect(phoenix.getByText(HARMATTAN.headline).first()).toBeVisible()
    await phoenix.getByRole('button', { name: PREVIEW_COPY.close }).click()
    await expect(phoenix).toHaveCount(0)
  })

  let campaignPath = ''
  await test.step('Tunde submits it and it waits for Global', async () => {
    campaignPath = await submitCampaign(tunde, HARMATTAN)
    await expect(tunde.getByRole('heading', { name: HARMATTAN.headline })).toBeVisible()
    await expect(tunde.getByText(STATUS_LABEL.review, { exact: true })).toBeVisible()
    await expect(tunde.getByText(CAMPAIGN_COPY.status.review)).toBeVisible()
    await expect(tunde.getByText(CAMPAIGN_COPY.daily.review)).toBeVisible()
  })

  await test.step('Global approves it from the queue', async () => {
    await signIn(admin, ADMIN)
    await approveCampaign(admin, HARMATTAN.headline)
  })

  await test.step("Tunde's home shows it Live, and the bell says it is live on Phoenix", async () => {
    await tunde.goto('/app')
    await tunde.getByRole('button', { name: new RegExp(`^${HOME.pills.live}`) }).click()
    await tunde.waitForURL('**/app?filter=live')
    const card = homeCard(tunde, HARMATTAN.headline)
    await expect(card.getByText(STATUS_LABEL.live, { exact: true })).toBeVisible()
    await expect(card).toHaveAttribute('href', campaignPath)

    await tunde.getByRole('button', { name: SHELL.bell.label }).click()
    const bell = tunde.getByRole('region', { name: SHELL.bell.label })
    await expect(bell.getByText(NOTIFY.live(HARMATTAN.name).title)).toBeVisible()
  })

  await test.step('its page says Live, with Pause to hand and nothing delivered yet', async () => {
    await tunde.goto(campaignPath)
    await expect(tunde.getByText(STATUS_LABEL.live, { exact: true })).toBeVisible()
    await expect(tunde.getByRole('button', { name: HOME.pause, exact: true })).toBeVisible()
    await expect(metricValue(tunde, CAMPAIGN_COPY.kpi.impressions)).toHaveText('0')
  })

  await tunde.context().close()
  await admin.context().close()
})
