import { useEffect } from 'react';
import { useNavStore } from './store/navStore';
import { useSelectionStore } from './store/selectionStore';
import { basename } from './lib/format';
import { Breadcrumb } from './components/browser/Breadcrumb';
import { FileList } from './components/browser/FileList';
import { FolderTree } from './components/tree/FolderTree';
import { QuickAccess } from './components/tree/QuickAccess';
import { ChatPanel } from './components/chat/ChatPanel';

/**
 * Three-panel layout from SPEC.md.
 * Left = chat (Claude agent), Center = file browser, Right = folder tree.
 * M1: the center browser shows real drives + directory contents.
 */
function App() {
  const init = useNavStore((s) => s.init);
  const location = useNavStore((s) => s.location);
  const select = useSelectionStore((s) => s.select);
  const clearSelection = useSelectionStore((s) => s.clear);

  useEffect(() => {
    init();
  }, [init]);

  // Default the chat context to the folder you're currently browsing.
  // A single-click on a file/row overrides this with that entry.
  useEffect(() => {
    if (location === null) clearSelection();
    else select(location, 'directory', basename(location));
  }, [location, select, clearSelection]);

  return (
    <div className="app">
      <ChatPanel />

      <section className="panel browser-panel">
        <Breadcrumb />
        <div className="panel__body nopad">
          <FileList />
        </div>
      </section>

      <section className="panel tree-panel">
        <header className="panel__header" dir="rtl">תיקיות</header>
        <div className="panel__body nopad">
          <QuickAccess />
          <FolderTree />
        </div>
      </section>
    </div>
  );
}

export default App;
