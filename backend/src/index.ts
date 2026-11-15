import { initFirebase } from './config/firebase.js'
import { createApp } from './app.js'

initFirebase()

const parsedPort = Number(process.env.PORT)
const port = Number.isNaN(parsedPort) ? 8080 : parsedPort
createApp().listen(port, () => {
  console.log(`Listening on port ${port}`)
})
