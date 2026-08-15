import {
  AsyncList,
  type AsyncListScrollbarMode,
} from '@vmariev/react-async-list';

import { makeRows } from '../fakeApi';

const MODES: AsyncListScrollbarMode[] = ['custom', 'native', 'hidden'];
const ROWS = makeRows(30, 'Row');

const DESCRIPTIONS: Record<AsyncListScrollbarMode, string> = {
  custom: 'drawn by the library',
  native: "the browser's own",
  hidden: 'scrolls, no bar',
};

/** All three scrollbar modes over identical content. */
export const ScrollbarModes = () => (
  <section className="demo">
    <div className="demo__header">
      <h2>Scrollbar modes</h2>
      <p className="demo__note">
        Static content, so nothing fetches — this is purely about the bar.
      </p>
    </div>
    <div className="scroll-modes">
      {MODES.map((mode) => (
        <div key={mode}>
          <div className="scroll-modes__label">
            <code>{mode}</code> — {DESCRIPTIONS[mode]}
          </div>
          <AsyncList className="demo__list" scrollbar={mode}>
            {ROWS.map((row) => (
              <div className="row" key={row.id}>
                {row.label}
              </div>
            ))}
          </AsyncList>
        </div>
      ))}
    </div>
  </section>
);
