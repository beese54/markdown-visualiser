import { Dropzone } from '@/ingest/Dropzone'
import { Shell } from '@/reader/Shell'
import { useReader } from '@/state/store'

/**
 * Two states, and only two: the drop plate, or the reader.
 *
 * The app does one job, so there is no navigation, no settings, and no home
 * screen to get back to - closing the reader returns to the plate.
 */
export function App() {
  const hasSet = useReader((s) => s.set !== null)
  return hasSet ? <Shell /> : <div className="shell"><Dropzone /></div>
}
