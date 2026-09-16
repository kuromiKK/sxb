// The app reloads its initial route after catalog/rights initialization. Wait until
// that finishes so the temporary first page does not create a second visit.
let ready: () => void
export const learningReady = new Promise<void>(resolve => { ready = resolve })
export const finishLearningBootstrap = () => ready()
