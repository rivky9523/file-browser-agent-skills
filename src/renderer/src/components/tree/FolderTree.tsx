import { useNavStore } from '../../store/navStore';
import { TreeNode } from './TreeNode';

export function FolderTree() {
  const drives = useNavStore((s) => s.drives);

  if (drives.length === 0) {
    return <div className="placeholder">Loading drives…</div>;
  }

  return (
    <div className="foldertree">
      {drives.map((d) => (
        <TreeNode
          key={d.letter}
          name={`${d.label} (${d.letter})`}
          path={d.letter}
          depth={0}
          isDrive
        />
      ))}
    </div>
  );
}
