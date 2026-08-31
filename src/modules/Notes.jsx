import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { NotesRepository } from '../database/repositories/NotesRepository.js';
import { useUIStore } from '../stores/useUIStore.js';
import { generateId, formatDate } from '../utils/helpers.js';
import ConfirmModal from '../components/shared/ConfirmModal.jsx';

const notesRepo = new NotesRepository();

const PRIORITIES = ['urgent', 'high', 'normal', 'low'];

const NotesModule = () => {
  const { showSuccess, showError, showWarning } = useUIStore();

  const [notes, setNotes] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [author, setAuthor] = useState('');
  const [priority, setPriority] = useState('normal');
  const [filterPriority, setFilterPriority] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Loading + confirmation states
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);

  const loadNotes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await notesRepo.findAll({}, 'date DESC');
      setNotes(data);
    } catch (error) {
      showError('خطأ في تحميل الملاحظات: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    loadNotes();

    const handleRefresh = () => {
      loadNotes();
    };
    window.addEventListener('aldaffa:data-refresh', handleRefresh);
    return () => window.removeEventListener('aldaffa:data-refresh', handleRefresh);
  }, [loadNotes]);

  const saveNote = async () => {
    if (!title.trim()) {
      showWarning('يرجى إدخال عنوان الملاحظة');
      return;
    }

    setSaving(true);

    try {
      if (editingNote) {
        // Update existing note
        await notesRepo.update(editingNote.id, {
          title: title.trim(),
          content: content.trim(),
          author: author.trim(),
          priority
        });
        showSuccess('✅ تم تحديث الملاحظة');
      } else {
        // Create new note
        await notesRepo.create({
          id: generateId(),
          date: new Date().toISOString(),
          author: author.trim(),
          title: title.trim(),
          content: content.trim(),
          priority
        });
        showSuccess('✅ تم إضافة الملاحظة');
      }

      resetForm();
      await loadNotes();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('aldaffa:data-refresh'));
      }
    } catch (error) {
      showError('خطأ في حفظ الملاحظة: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteNote = async () => {
    const note = pendingDelete;
    setPendingDelete(null);
    if (!note) return;

    try {
      await notesRepo.delete(note.id);
      await loadNotes();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('aldaffa:data-refresh'));
      }
      showSuccess('✅ تم حذف الملاحظة');
    } catch (error) {
      showError('خطأ في حذف الملاحظة: ' + error.message);
    }
  };

  const editNote = (note) => {
    setEditingNote(note);
    setTitle(note.title);
    setContent(note.content || '');
    setAuthor(note.author || '');
    setPriority(note.priority || 'normal');
    setShowModal(true);
  };

  const resetForm = () => {
    setEditingNote(null);
    setTitle('');
    setContent('');
    setAuthor('');
    setPriority('normal');
    setShowModal(false);
  };

  const getPriorityColor = (p) => {
    switch (p) {
      case 'urgent': return 'text-red-400 bg-red-600/20 border-red-400/30';
      case 'high': return 'text-orange-400 bg-orange-600/20 border-orange-400/30';
      case 'normal': return 'text-blue-400 bg-blue-600/20 border-blue-400/30';
      case 'low': return 'text-gray-400 bg-gray-600/20 border-gray-400/30';
      default: return 'text-gray-400 bg-gray-600/20 border-gray-400/30';
    }
  };

  const getPriorityLabel = (p) => {
    switch (p) {
      case 'urgent': return '🔴 عاجل';
      case 'high': return '🟠 مهم';
      case 'normal': return '🔵 عادي';
      case 'low': return '⚪ منخفض';
      default: return 'عادي';
    }
  };

  // Priority filter chips with live counts
  const priorityCounts = useMemo(() => {
    const counts = { urgent: 0, high: 0, normal: 0, low: 0 };
    notes.forEach(n => {
      if (counts[n.priority] !== undefined) counts[n.priority] += 1;
    });
    return counts;
  }, [notes]);

  const filteredNotes = notes.filter(note => {
    // Priority filter
    if (filterPriority !== 'all' && note.priority !== filterPriority) {
      return false;
    }
    // Search filter
    return note.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (note.content && note.content.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (note.author && note.author.toLowerCase().includes(searchTerm.toLowerCase()));
  });

  return (
    <div className="h-full flex flex-col glass-card p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-gold flex items-center gap-2">
          <span>📝</span>
          <span>الملاحظات والمهام</span>
        </h2>
        <button
          onClick={() => {
            resetForm();
            setShowModal(true);
          }}
          className="btn-gold px-4 py-2"
        >
          ➕ ملاحظة جديدة
        </button>
      </div>

      <div className="flex flex-col gap-3 mb-4">
        {/* Search + priority select */}
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="🔍 بحث..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 bg-gray-800 text-white px-4 py-2 rounded-lg border border-gold/30"
          />
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="bg-gray-800 text-white px-4 py-2 rounded-lg border border-gold/30"
          >
            <option value="all">كل الأولويات</option>
            <option value="urgent">🔴 عاجل</option>
            <option value="high">🟠 مهم</option>
            <option value="normal">🔵 عادي</option>
            <option value="low">⚪ منخفض</option>
          </select>
        </div>

        {/* Priority filter chips */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilterPriority('all')}
            className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition-all ${
              filterPriority === 'all'
                ? 'bg-gold/20 border-gold text-gold'
                : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gold/40'
            }`}
          >
            الكل ({notes.length})
          </button>
          {PRIORITIES.map(p => (
            <button
              key={p}
              onClick={() => setFilterPriority(p)}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition-all ${getPriorityColor(p)} ${
                filterPriority === p
                  ? 'opacity-100 ring-1 ring-current'
                  : 'opacity-60 hover:opacity-100'
              }`}
            >
              {getPriorityLabel(p)} ({priorityCounts[p]})
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="glass-card p-4 animate-pulse">
                <div className="h-4 bg-gray-700 rounded mb-3 w-1/4"></div>
                <div className="h-5 bg-gray-700 rounded mb-2 w-3/4"></div>
                <div className="h-4 bg-gray-700 rounded w-full"></div>
              </div>
            ))}
          </div>
        ) : filteredNotes.length === 0 ? (
          <div className="text-center text-gray-500 py-12">
            {searchTerm ? 'لا توجد نتائج للبحث' : 'لا توجد ملاحظات مسجلة'}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredNotes.map(note => (
              <div
                key={note.id}
                className="glass-card p-4 hover:border-gold/50 transition-all cursor-pointer h-fit"
                onClick={() => editNote(note)}
              >
                <div className="flex justify-between items-start mb-3">
                  <span className={`text-xs px-2 py-1 rounded border ${getPriorityColor(note.priority)}`}>
                    {getPriorityLabel(note.priority)}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingDelete(note);
                    }}
                    className="text-red-500 hover:text-red-400 text-sm"
                  >
                    🗑️
                  </button>
                </div>

                <h3 className="text-lg font-bold text-gold mb-2 line-clamp-2">
                  {note.title}
                </h3>

                {note.content && (
                  <p className="text-sm text-gray-300 mb-3 line-clamp-3 whitespace-pre-wrap">
                    {note.content}
                  </p>
                )}

                <div className="flex justify-between items-center text-xs text-gray-500 border-t border-gray-700 pt-2">
                  <span>{formatDate(note.date)}</span>
                  {note.author && <span>👤 {note.author}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" dir="rtl">
          <div className="glass-card p-6 w-[700px] max-h-[90vh] overflow-y-auto scrollbar-thin">
            <h2 className="text-2xl font-bold text-gold mb-4">
              {editingNote ? 'تعديل الملاحظة' : 'ملاحظة جديدة'}
            </h2>
            <div className="space-y-3 mb-6">
              <div>
                <label className="text-sm text-gray-400 mb-1 block">العنوان *</label>
                <input
                  type="text"
                  placeholder="عنوان الملاحظة..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-1 block">المحتوى</label>
                <textarea
                  placeholder="تفاصيل الملاحظة..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30 h-48 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">المسجل</label>
                  <input
                    type="text"
                    placeholder="اسم الكاتب..."
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">الأولوية</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30"
                  >
                    <option value="urgent">🔴 عاجل</option>
                    <option value="high">🟠 مهم</option>
                    <option value="normal">🔵 عادي</option>
                    <option value="low">⚪ منخفض</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={saveNote}
                disabled={saving}
                className="flex-1 btn-gold py-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? '⏳ جاري الحفظ...' : (editingNote ? '✅ تحديث' : '✅ حفظ')}
              </button>
              <button
                onClick={resetForm}
                className="flex-1 bg-gray-700 text-white px-4 py-3 rounded-lg font-bold hover:bg-gray-600"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmModal
        open={!!pendingDelete}
        title="حذف الملاحظة"
        icon="🗑️"
        message={pendingDelete
          ? `هل أنت متأكد من حذف الملاحظة "${pendingDelete.title}"؟`
          : ''}
        confirmLabel="🗑️ حذف"
        cancelLabel="إلغاء"
        onConfirm={deleteNote}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
};

export default NotesModule;
