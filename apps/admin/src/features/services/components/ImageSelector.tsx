import { useState, useRef, useLayoutEffect } from 'react';
import { ArrowDown, ArrowUp, ImagePlus, Star, Trash2 } from 'lucide-react';
import { Button, IconButton } from '../../../components/ui';
import { usePreferences } from '../../../preferences';
import { useServiceCopy } from '../copy';
import type { DemoImage } from '../model';
import { validImageFiles, reorder } from '../validation';
import { useDemoServices } from '../DemoServicesProvider';
import { TextField } from './Fields';

export function ImageSelector({ images, onChange }: { images: DemoImage[]; onChange: (images: DemoImage[]) => void }) {
  const c = useServiceCopy(), { language } = usePreferences(), { trackUrl } = useDemoServices();
  const [error, setError] = useState(false), [busy, setBusy] = useState(false);
  const latest = useRef({ images, onChange });
  const mounted = useRef(false);
  useLayoutEffect(() => { latest.current = { images, onChange }; });
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function select(files: File[]) {
    if (!validImageFiles(files, images.length)) { setError(true); return; }
    setError(false); setBusy(true);
    const created: string[] = [];
    try {
      const additions = await Promise.all(files.map(async file => {
        const src = URL.createObjectURL(file); created.push(src);
        const image = new Image(); image.src = src; await image.decode();
        return { id: crypto.randomUUID(), src, name: file.name, alt: { es: '', en: '' } };
      }));
      if (!mounted.current) { created.forEach(url => URL.revokeObjectURL(url)); return; }
      created.forEach(trackUrl); latest.current.onChange([...latest.current.images, ...additions]);
    } catch { created.forEach(url => URL.revokeObjectURL(url)); setError(true); }
    finally { setBusy(false); }
  }
  return <div className="image-selector" aria-busy={busy}><label className="image-picker"><ImagePlus size={24} aria-hidden="true" /><strong>{c.choose}</strong><span>{c.imageHelp}</span><input type="file" aria-label={c.choose} accept="image/jpeg,image/png,image/webp" multiple disabled={busy} onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; if (files.length) void select(files); }} /></label>
    {error && <p role="alert" className="field-error">{c.fileError}</p>}
    {!images.length && <p className="empty-images">{c.noImages}</p>}
    <ol className="image-list" aria-label={c.media}>{images.map((image, index) => <li key={image.id}><div className="image-order"><img src={image.src} alt={image.alt[language]} /><span>{index === 0 ? c.cover : String(index + 1)}</span></div><div className="image-fields"><p className="image-filename">{image.name}</p><TextField label={`${c.altEs} · ${index + 1}`} value={image.alt.es} maxLength={250} onChange={value => onChange(images.map(row => row.id === image.id ? { ...row, alt: { ...row.alt, es: value } } : row))} /><TextField label={`${c.altEn} · ${index + 1}`} value={image.alt.en} maxLength={250} onChange={value => onChange(images.map(row => row.id === image.id ? { ...row, alt: { ...row.alt, en: value } } : row))} /><div className="image-actions"><Button icon={Star} disabled={index === 0} onClick={() => onChange(reorder(images, index, 0))}>{c.makeCover}</Button><IconButton icon={ArrowUp} label={`${c.up} · ${index + 1}`} disabled={index === 0} onClick={() => onChange(reorder(images, index, index - 1))} /><IconButton icon={ArrowDown} label={`${c.down} · ${index + 1}`} disabled={index === images.length - 1} onClick={() => onChange(reorder(images, index, index + 1))} /><IconButton icon={Trash2} label={`${c.remove} · ${index + 1}`} onClick={() => onChange(images.filter(row => row.id !== image.id))} /></div></div></li>)}</ol>
  </div>;
}

