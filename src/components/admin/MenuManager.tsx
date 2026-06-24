import { useState } from 'react';
import type { MenuCategory, MenuItem } from '../../lib/types';
import { useMenu, type NewMenuItem } from '../../hooks/useMenu';

const CATEGORIES: { key: MenuCategory; label: string }[] = [
  { key: 'seat', label: '席種（セット料金）' },
  { key: 'cast', label: 'キャストメニュー' },
  { key: 'food', label: 'フード' },
  { key: 'shot', label: 'ショット' },
  { key: 'champagne', label: 'シャンパン' },
  { key: 'option', label: 'オプション' },
];

interface MenuRowProps {
  item: MenuItem;
  onSave: (id: string, patch: Partial<NewMenuItem>) => Promise<string | null>;
  onDelete: (id: string) => Promise<string | null>;
}

function MenuRow({ item, onSave, onDelete }: MenuRowProps) {
  const [name, setName] = useState(item.name);
  const [price, setPrice] = useState(item.price);
  const [counts, setCounts] = useState(item.counts_as_order);
  const [active, setActive] = useState(item.active);
  const [isOriginal, setIsOriginal] = useState(item.is_original);
  const [saving, setSaving] = useState(false);

  const dirty =
    name !== item.name ||
    price !== item.price ||
    counts !== item.counts_as_order ||
    active !== item.active ||
    isOriginal !== item.is_original;

  async function save() {
    setSaving(true);
    await onSave(item.id, {
      name: name.trim() || item.name,
      price,
      counts_as_order: counts,
      active,
      is_original: isOriginal,
    });
    setSaving(false);
  }

  async function remove() {
    if (!window.confirm(`「${item.name}」を削除しますか？`)) return;
    await onDelete(item.id);
  }

  return (
    <div className={`menu-row${active ? '' : ' menu-row--inactive'}`}>
      <input
        className="menu-row-name"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <span className="menu-row-yen">¥</span>
      <input
        className="menu-row-price"
        type="number"
        min={0}
        value={price}
        onChange={(e) => setPrice(Number(e.target.value))}
      />
      <label className="menu-row-check" title="1セット1オーダー必須を満たす品">
        <input
          type="checkbox"
          checked={counts}
          onChange={(e) => setCounts(e.target.checked)}
        />
        1オーダー
      </label>
      <label className="menu-row-check" title="お客さんの選択肢に表示する">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
        />
        有効
      </label>
      {item.category === 'champagne' && (
        <label
          className="menu-row-check"
          title="オリジナルシャンパン（オリシャン）として表示する"
        >
          <input
            type="checkbox"
            checked={isOriginal}
            onChange={(e) => setIsOriginal(e.target.checked)}
          />
          オリシャン
        </label>
      )}
      <button
        className="menu-row-save"
        onClick={() => void save()}
        disabled={!dirty || saving}
      >
        {saving ? '…' : '保存'}
      </button>
      <button className="menu-row-del" onClick={() => void remove()}>
        ✕
      </button>
    </div>
  );
}

interface AddFormProps {
  category: MenuCategory;
  nextOrder: number;
  onAdd: (item: NewMenuItem) => Promise<string | null>;
}

function AddMenuItemForm({ category, nextOrder, onAdd }: AddFormProps) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState(0);
  const [counts, setCounts] = useState(category !== 'seat');
  const [isOriginal, setIsOriginal] = useState(false);
  const [adding, setAdding] = useState(false);

  async function add() {
    if (!name.trim()) return;
    setAdding(true);
    const err = await onAdd({
      category,
      name: name.trim(),
      price,
      counts_as_order: counts,
      note: null,
      display_order: nextOrder,
      active: true,
      is_original: category === 'champagne' ? isOriginal : false,
    });
    setAdding(false);
    if (!err) {
      setName('');
      setPrice(0);
      setIsOriginal(false);
    }
  }

  return (
    <div className="menu-add">
      <input
        className="menu-row-name"
        type="text"
        placeholder="新規メニュー名"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <span className="menu-row-yen">¥</span>
      <input
        className="menu-row-price"
        type="number"
        min={0}
        value={price}
        onChange={(e) => setPrice(Number(e.target.value))}
      />
      {category !== 'seat' && (
        <label className="menu-row-check">
          <input
            type="checkbox"
            checked={counts}
            onChange={(e) => setCounts(e.target.checked)}
          />
          1オーダー
        </label>
      )}
      {category === 'champagne' && (
        <label className="menu-row-check">
          <input
            type="checkbox"
            checked={isOriginal}
            onChange={(e) => setIsOriginal(e.target.checked)}
          />
          オリシャン
        </label>
      )}
      <button
        className="menu-add-btn"
        onClick={() => void add()}
        disabled={adding || !name.trim()}
      >
        {adding ? '追加中…' : '＋ 追加'}
      </button>
    </div>
  );
}

export function MenuManager() {
  const { menuItems, loading, addItem, updateItem, deleteItem } = useMenu();

  return (
    <div className="menu-manager">
      {loading ? (
        <p className="loading">メニュー読み込み中…</p>
      ) : (
        CATEGORIES.map(({ key, label }) => {
          const items = menuItems.filter((m) => m.category === key);
          const nextOrder =
            Math.max(0, ...items.map((m) => m.display_order)) + 10;
          return (
            <div key={key} className="menu-category">
              <h4 className="menu-category-title">{label}</h4>
              {items.map((item) => (
                <MenuRow
                  key={item.id}
                  item={item}
                  onSave={updateItem}
                  onDelete={deleteItem}
                />
              ))}
              <AddMenuItemForm
                category={key}
                nextOrder={nextOrder}
                onAdd={addItem}
              />
            </div>
          );
        })
      )}
      <p className="menu-note">
        ※価格・名前を変更したら「保存」を押してください。「有効」を外すとお客さんの選択肢から隠れます（データは残ります）。
      </p>
    </div>
  );
}
