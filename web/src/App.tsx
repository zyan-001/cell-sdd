import { useState, useCallback } from 'react';
import DependencyGraph from './components/DependencyGraph';
import CellDetail from './components/CellDetail';
import GlossaryPanel from './components/GlossaryPanel';
import CheckPanel from './components/CheckPanel';
import './App.css';

function App() {
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [graphRefreshKey, setGraphRefreshKey] = useState(0);
  const [showGlossary, setShowGlossary] = useState(false);

  const handleCellChanged = useCallback(() => {
    setGraphRefreshKey((k) => k + 1);
  }, []);

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="header-left">
          <span className="logo-icon">🧬</span>
          <h1>Cell-SDD Notebook</h1>
        </div>
        <div className="header-right">
          <button
            onClick={() => setShowGlossary(!showGlossary)}
            className={showGlossary ? 'btn btn-primary' : 'btn'}
          >
            Glossary
          </button>
          <CheckPanel />
          <span className="header-hint">Click a cell to edit modules and confirm changes</span>
        </div>
      </header>
      <main className="app-main">
        <aside className="sidebar">
          <div className="sidebar-header">
            <span>Dependency Graph</span>
          </div>
          <div className="sidebar-content">
            <DependencyGraph
              selectedCellId={selectedCellId}
              onSelectCell={setSelectedCellId}
              refreshKey={graphRefreshKey}
            />
          </div>
        </aside>
        <section className="detail-panel">
          <CellDetail
            cellId={selectedCellId}
            onCellChanged={handleCellChanged}
          />
        </section>
      </main>
      {showGlossary && <GlossaryPanel onClose={() => setShowGlossary(false)} />}
    </div>
  );
}

export default App;
