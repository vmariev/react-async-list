import { Bidirectional } from './demos/Bidirectional';
import { CustomLoaderAndErrors } from './demos/CustomLoaderAndErrors';
import { HeadlessTable } from './demos/HeadlessTable';
import { InfiniteDown } from './demos/InfiniteDown';
import { ReverseChat } from './demos/ReverseChat';
import { ScrollbarModes } from './demos/ScrollbarModes';
import { Virtualized } from './demos/Virtualized';

export const App = () => (
  <main className="layout">
    <header>
      <h1>@vmariev/react-async-list</h1>
      <p className="subtitle">
        Bidirectional infinite scroll for React — zero runtime dependencies.
      </p>
    </header>
    <InfiniteDown />
    <Bidirectional />
    <ReverseChat />
    <CustomLoaderAndErrors />
    <HeadlessTable />
    <Virtualized />
    <ScrollbarModes />
  </main>
);
