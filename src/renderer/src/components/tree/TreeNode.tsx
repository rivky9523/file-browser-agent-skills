import { useTreeStore } from '../../store/treeStore';
import { useNavStore } from '../../store/navStore';

interface Props {
  name: string;
  path: string;
  depth: number;
  isDrive?: boolean;
}

export function TreeNode({ name, path, depth, isDrive }: Props) {
  const { expanded, children, loading, toggle } = useTreeStore();
  const go = useNavStore((s) => s.go);
  const location = useNavStore((s) => s.location);

  const isOpen = !!expanded[path];
  const kids = children[path];
  const isLoading = !!loading[path];
  const isCurrent = location === path;

  const onChevron = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggle(path);
  };

  const onLabel = () => {
    go(path);
    if (!isOpen) toggle(path);
  };

  return (
    <div className="treenode">
      <div
        className={`treerow ${isCurrent ? 'current' : ''}`}
        style={{ paddingLeft: depth * 14 + 6 }}
        onClick={onLabel}
        title={path}
      >
        <span className="chevron" onClick={onChevron}>
          {isOpen ? '▾' : '▸'}
        </span>
        <span className="treeicon">{isDrive ? '💽' : '📁'}</span>
        <span className="treelabel">{name}</span>
      </div>

      {isOpen && (
        <div className="treechildren">
          {isLoading && <div className="treeloading" style={{ paddingLeft: (depth + 1) * 14 + 22 }}>…</div>}
          {!isLoading &&
            kids?.map((c) => (
              <TreeNode key={c.path} name={c.name} path={c.path} depth={depth + 1} />
            ))}
          {!isLoading && kids?.length === 0 && (
            <div className="treeempty" style={{ paddingLeft: (depth + 1) * 14 + 22 }}>
              (empty)
            </div>
          )}
        </div>
      )}
    </div>
  );
}
