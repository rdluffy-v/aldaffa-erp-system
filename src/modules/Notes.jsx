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
  const [noteDate, setNoteDate] = useState(new Date().toISOString().slice(0, 10));
  const [filterPriority, setFilterPriority] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('date_desc'); // 'date_desc' | 'date_asc' | 'priority'
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');

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
    const nowIso = new Date().toISOString();
    // Build ISO timestamp from selected noteDate or keep full ISO
    let finalDateIso = nowIso;
    if (noteDate) {
      const timePart = nowIso.includes('T') ? nowIso.split('T')[1] : '00:00:00.000Z';
      finalDateIso = `${noteDate}T${timePart}`;
    }

    try {
      if (editingNote) {
        // Update existing note
        await notesRepo.update(editingNote.id, {
          title: title.trim(),
          content: content.trim(),
          author: author.trim(),
          priority,
          date: finalDateIso,
          updated_at: nowIso
        });
        showSuccess('✅ تم تحديث الملاحظة');
      } else {
        // Create new note
        await notesRepo.create({
          id: generateId(),
          date: finalDateIso,
          author: author.trim(),
          title: title.trim(),
          content: content.trim(),
          priority,
          updated_at: nowIso
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
    setNoteDate(note.date ? note.date.slice(0, 10) : new Date().toISOString().slice(0, 10));
    setShowModal(true);
  };

  const resetForm = () => {
    setEditingNote(null);
    setTitle('');
    setContent('');
    setAuthor('');
    setPriority('normal');
    setNoteDate(new Date().toISOString().slice(0, 10));
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

  const filteredNotes = useMemo(() => {
    let list = notes.filter(note => {
      // Priority filter
      if (filterPriority !== 'all' && note.priority !== filterPriority) {
        return false;
      }
      // Date range filter
      if (startDateFilter) {
        const itemDateStr = (note.date || '').slice(0, 10);
        if (itemDateStr && itemDateStr < startDateFilter) return false;
      }
      if (endDateFilter) {
        const itemDateStr = (note.date || '').slice(0, 10);
        if (itemDateStr && itemDateStr > endDateFilter) return false;
      }
      // Search filter
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        return (
          note.title.toLowerCase().includes(term) ||
          (note.content && note.content.toLowerCase().includes(term)) ||
          (note.author && note.author.toLowerCase().includes(term))
        );
      }
      return true;
    });

    // Sorting
    list.sort((a, b) => {
      if (sortBy === 'date_desc') {
        return (b.date || '').localeCompare(a.date || '');
      }
      if (sortBy === 'date_asc') {
        return (a.date || '').localeCompare(b.date || '');
      }
      if (sortBy === 'updated_desc') {
        const dateA = a.updated_at || a.date || '';
        const dateB = b.updated_at || b.date || '';
        return dateB.localeCompare(dateA);
      }
      if (sortBy === 'priority') {
        const priorityOrder = { urgent: 4, high: 3, normal: 2, low: 1 };
        return (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
      }
      return 0;
    });

    return list;
  }, [notes, filterPriority, startDateFilter, endDateFilter, searchTerm, sortBy]);

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
        {/* Search + priority + sort + date range */}
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="🔍 بحث في الملاحظات أو الكاتب..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 min-w-[200px] bg-gray-800 text-white px-4 py-2 rounded-lg border border-gold/30 text-xs sm:text-sm"
          />
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="bg-gray-800 text-white px-3 py-2 rounded-lg border border-gold/30 text-xs sm:text-sm cursor-pointer"
          >
            <option value="all">كل الأولويات</option>
            <option value="urgent">🔴 عاجل</option>
            <option value="high">🟠 مهم</option>
            <option value="normal">🔵 عادي</option>
            <option value="low">⚪ منخفض</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-gray-800 text-white px-3 py-2 rounded-lg border border-gold/30 text-xs sm:text-sm cursor-pointer font-bold"
            title="ترتيب الملاحظات"
          >
            <option value="date_desc">📅 التاريخ (الأحدث)</option>
            <option value="date_asc">📅 التاريخ (الأقدم)</option>
            <option value="updated_desc">🔄 آخر تعديل</option>
            <option value="priority">⚡ حسب الأولوية</option>
          </select>
          <div className="flex items-center gap-1.5 bg-gray-800/80 px-3 py-1.5 rounded-lg border border-gold/20 text-xs">
            <span className="text-gray-400 font-bold shrink-0">من:</span>
            <input
              type="date"
              value={startDateFilter}
              onChange={(e) => setStartDateFilter(e.target.value)}
              className="bg-gray-900 text-white px-2 py-1 rounded border border-gray-700 text-xs focus:border-gold outline-none"
            />
            <span className="text-gray-400 font-bold shrink-0 mr-1">إلى:</span>
            <input
              type="date"
              value={endDateFilter}
              onChange={(e) => setEndDateFilter(e.target.value)}
              className="bg-gray-900 text-white px-2 py-1 rounded border border-gray-700 text-xs focus:border-gold outline-none"
            />
            {(startDateFilter || endDateFilter) && (
              <button
                type="button"
                onClick={() => {
                  setStartDateFilter('');
                  setEndDateFilter('');
                }}
                className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white transition-colors cursor-pointer text-[10px] font-bold"
              >
                ✕ مسح
              </button>
            )}
          </div>
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

                <div className="flex flex-wrap justify-between items-center text-xs text-gray-500 border-t border-gray-700/60 pt-2 gap-2">
                  <div className="flex items-center gap-2">
                    <span title="تاريخ التسجيل">📅 {formatDate(note.date)}</span>
                    {note.updated_at && note.updated_at !== note.date && (
                      <span className="text-[10px] text-gray-400" title={`آخر تعديل: ${formatDate(note.updated_at)}`}>
                        (مُعدل: {formatDate(note.updated_at)})
                      </span>
                    )}
                  </div>
                  {note.author && <span>👤 {note.author}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="glass-card bg-[#161b22] dark:bg-[#151f32] border border-gold/30 p-6 w-[700px] max-w-full max-h-[90vh] overflow-y-auto scrollbar-thin rounded-2xl shadow-2xl">
            <h2 className="text-2xl font-bold text-gold mb-4">
              {editingNote ? 'تعديل الملاحظة' : 'ملاحظة جديدة'}
            </h2>
            <div className="space-y-3.5 mb-6">
              <div>
                <label className="text-sm text-gray-300 font-bold mb-1 block">العنوان *</label>
                <input
                  type="text"
                  placeholder="عنوان الملاحظة..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-gray-900 text-white px-4 py-2.5 rounded-lg border border-gold/30 focus:border-gold outline-none text-sm"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-sm text-gray-300 font-bold mb-1 block">المحتوى</label>
                <textarea
                  placeholder="تفاصيل الملاحظة..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full bg-gray-900 text-white px-4 py-2.5 rounded-lg border border-gold/30 focus:border-gold outline-none h-40 resize-none text-sm"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-sm text-gray-300 font-bold mb-1 block">المسجل</label>
                  <input
                    type="text"
                    placeholder="اسم الكاتب..."
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    className="w-full bg-gray-900 text-white px-3 py-2 rounded-lg border border-gold/30 focus:border-gold outline-none text-xs sm:text-sm"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-300 font-bold mb-1 block">الأولوية</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="w-full bg-gray-900 text-white px-3 py-2 rounded-lg border border-gold/30 focus:border-gold outline-none text-xs sm:text-sm cursor-pointer"
                  >
                    <option value="urgent">🔴 عاجل</option>
                    <option value="high">🟠 مهم</option>
                    <option value="normal">🔵 عادي</option>
                    <option value="low">⚪ منخفض</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm text-gray-300 font-bold mb-1 block">تاريخ الملاحظة</label>
                  <input
                    type="date"
                    value={noteDate}
                    onChange={(e) => setNoteDate(e.target.value)}
                    className="w-full bg-gray-900 text-white px-3 py-2 rounded-lg border border-gold/30 focus:border-gold outline-none text-xs sm:text-sm"
                    title="تاريخ تسجيل أو استحقاق الملاحظة"
                  />
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
