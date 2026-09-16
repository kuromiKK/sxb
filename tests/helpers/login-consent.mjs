export async function finishLoginConsent(page,result){
 if(!result.consentRequired)return result
 const dialog=page.locator('.protocol-dialog');await dialog.waitFor()
 await dialog.locator('uni-checkbox').click()
 const response=page.waitForResponse(r=>r.url().endsWith('/api/auth/protocol-consent')&&r.status()===200)
 await dialog.locator('.primary').click()
 return (await response).json()
}
