import { useNavStore } from '../../store/navStore';
import { pathSegments } from '../../lib/format';

export function Breadcrumb() {
  const { location, index, history, go, back, forward, goUp, refresh } = useNavStore();
  const segs = location ? pathSegments(location) : [];

  return (
    <div className="toolbar" dir="rtl">
      <div className="toolbar__nav">
        <button className="iconbtn" onClick={back} disabled={index <= 0} title="אחורה">
          ›
        </button>
        <button
          className="iconbtn"
          onClick={forward}
          disabled={index >= history.length - 1}
          title="קדימה"
        >
          ‹
        </button>
        <button className="iconbtn" onClick={goUp} disabled={location === null} title="למעלה">
          ↑
        </button>
        <button className="iconbtn" onClick={refresh} title="רענון">
          ⟳
        </button>
      </div>

      <div className="breadcrumb">
        <button className="crumb" onClick={() => go(null)}>
          המחשב הזה
        </button>
        {segs.map((s) => (
          <span key={s.path} className="crumb-wrap">
            <span className="crumb-sep">‹</span>
            <button className="crumb" onClick={() => go(s.path)} dir="auto">
              {s.label}
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
