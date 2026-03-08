"""

ACUHIT NLP Pipeline - Tek Sayfa (Unified) Versiyonu

Bu script; negation_handler, morphology, summarizer, model_ner ve nlp_pipeline

kodlarının tamamını tek bir sayfada birleştirilmiş halidir.

"""



# ==============================================================================
# --- FILE: negation_handler.py ---
# ==============================================================================

"""
negation_handler.py — Türkçe Tıbbi Negasyon Tespiti
=====================================================
"hipertansiyon yok"          → negated=True
"hipertansiyon yok, diyabet var" → hipertansiyon negated, diyabet pozitif
"kanser tespit edilmedi"     → negated=True
"inme geçirmedi"             → negated=True

Yaklaşım (cümle/clause bazlı):
  1. Entity'yi metin içinde bul
  2. Entity'nin solunu ve sağını virgül/noktalı virgül ile kes (clause)
  3. Sol clause'da PRE negasyon ipucu var mı?
  4. Sağ clause'da POST negasyon ipucu var mı?

Referans: NegEx algoritmasının Türkçe uyarlaması.
"""

import re
from typing import List, Tuple

# ──────────────────────────────────────────────
# NEGASYON İPUÇLARI
# ──────────────────────────────────────────────

# PRE-NEGATION: entity'den ÖNCE gelen ipuçları
PRE_NEGATION_CUES = [
    # Uzundan kısaya sıralı (önce uzun kalıplar eşleşsin)
    "bulunmamaktadır", "bulunmamakta", "bulunmuyor",
    "mevcut değildir", "mevcut değil",
    "tespit edilmemiş", "tespit edilmedi",
    "saptanmamış", "saptanmadı",
    "gözlemlenmedi", "gözlenmedi",
    "görülmemiş", "görülmedi",
    "belirlenmedi", "izlenmedi", "rastlanmadı",
    "ekarte edildi", "dışlandı", "reddedildi",
    "geçirmemiş", "geçirmedi",
    "olmamış", "olmadı", "olmayan",
    "negatif", "negative",
    "yoktur", "yoktu",
    "değil",
    "yok",
    "(-)", "(-",
]

# POST-NEGATION: entity'den SONRA gelen ipuçları
POST_NEGATION_CUES = [
    "bulunmamaktadır", "bulunmuyor",
    "mevcut değildir", "mevcut değil",
    "saptanmamış", "saptanmadı",
    "gözlemlenmedi", "gözlenmedi",
    "tespit edilmedi",
    "geçirmemiş", "geçirmedi",
    "olmadığı", "olmamış", "olmadı",
    "negatif", "negative",
    "yoktur", "yoktu",
    "düşünülmüyor",
    "yok",
    "(-)", "(-",
]

# SCOPE BREAKERS: bu kelimeler negasyonu farklı clause'a sızdırmaz
# (clause kesme işlemi virgülle yapılıyor, bunlar ek güvence)
SCOPE_BREAKERS = [
    "bununla birlikte", "buna karşın", "buna rağmen",
    "ne var ki", "öte yandan",
    "ancak", "fakat", "lakin", "ama", "oysa", "halbuki",
    "dışında", "haricinde",
]


# ──────────────────────────────────────────────
# YARDIMCI FONKSİYONLAR
# ──────────────────────────────────────────────

def _split_clause(text_lower: str, entity_start: int, entity_end: int):
    """
    Entity'nin içinde bulunduğu clause'u çıkarır.

    Sınır kuralları:
    - SOL taraf (entity öncesi): en son gelen virgül, noktalı virgül veya
      'BOŞLUK + nokta' (cümle sonu) bulunur. Bu sayede 'geçirmedi.' gibi
      cümle-içi noktalar sol aramayı etkilemez.
    - SAĞ taraf (entity sonrası): ilk virgül, noktalı virgül VEYA nokta
      cümle sınırı sayılır. Böylece farklı cümledeki 'yok' entity'yi
      olumsuzlaştıramaz.

    Örnek:
        'koah ve astım tanısı mevcut. ateş yok, öksürük var.'
         → 'koah' için sağ clause = 've astım tanısı mevcut'  (noktada kesilir)
         → 'ateş' için sağ clause = ' yok'                   (virgülde kesilir)

    Returns:
        (left_clause, right_clause)
    """
    left_raw  = text_lower[:entity_start]
    right_raw = text_lower[entity_end:]

    # ── SOL TARAF ───────────────────────────────────────────────
    # Sınır karakterleri: ',', ';', '. ' (boşluklu nokta = cümle sonu)
    # En sona yakın olanı bul → o noktadan sonrasını al
    left_cut = left_raw
    best_pos = -1
    best_len = 1  # delimiter uzunluğu

    for d in (",", ";"):
        pos = left_cut.rfind(d)
        if pos > best_pos:
            best_pos = pos
            best_len = len(d)

    # Cümle sonu noktası: '. ' veya '.\n' — kısaltma noktalarını (Dr., vb.) atlar
    for sent_end in (". ", ".\n", "! ", "? "):
        pos = left_cut.rfind(sent_end)
        if pos > best_pos:
            best_pos = pos
            best_len = len(sent_end)

    if best_pos >= 0:
        left_cut = left_cut[best_pos + best_len:]

    # Scope breaker solda varsa ondan sonrasını al
    for brk in SCOPE_BREAKERS:
        pos = left_cut.rfind(brk)
        if pos >= 0:
            left_cut = left_cut[pos + len(brk):]

    # ── SAĞ TARAF ───────────────────────────────────────────────
    # Sınır karakterleri: ',', ';', '.' — hepsi cümle sınırı sayılır
    # En yakın (en küçük pos) olanı bul → o noktaya kadar al
    right_cut = right_raw
    best_pos  = len(right_cut)  # sonsuz başlangıç

    for d in (",", ";", ".", "!", "?"):
        pos = right_cut.find(d)
        if 0 <= pos < best_pos:
            best_pos = pos

    right_cut = right_cut[:best_pos]

    # Scope breaker sağda varsa ondan öncesini al
    for brk in SCOPE_BREAKERS:
        pos = right_cut.find(brk)
        if pos >= 0:
            right_cut = right_cut[:pos]

    return left_cut.strip(), right_cut.strip()


# ──────────────────────────────────────────────
# ANA FONKSİYON
# ──────────────────────────────────────────────

def is_negated(
    text: str,
    entity: str,
    pre_window: int = 5,   # artık kullanılmıyor, geriye uyumluluk
    post_window: int = 3,  # artık kullanılmıyor, geriye uyumluluk
) -> bool:
    """
    Verilen metinde entity'nin negatif bağlamda geçip geçmediğini tespit eder.

    Args:
        text:   Ham Türkçe tıbbi metin
        entity: Tespit edilmek istenen entity (tek veya çok kelimeli)

    Returns:
        True  → entity negatif bağlamda (yok/geçirmedi/tespit edilmedi vb.)
        False → entity pozitif veya belirsiz bağlamda

    Örnekler:
        >>> is_negated("hipertansiyon yok.", "hipertansiyon")
        True
        >>> is_negated("diyabet mevcut.", "diyabet")
        False
        >>> is_negated("kanser tespit edilmedi.", "kanser")
        True
        >>> is_negated("astım öyküsü var, hipertansiyon yok.", "astım")
        False
        >>> is_negated("inme geçirmedi.", "inme")
        True
    """
    text_lower = text.lower()
    entity_lower = entity.lower()

    if entity_lower not in text_lower:
        return False

    entity_start = text_lower.find(entity_lower)
    entity_end = entity_start + len(entity_lower)

    left_clause, right_clause = _split_clause(text_lower, entity_start, entity_end)

    # PRE negasyon: sol clause'da ipucu var mı?
    for cue in PRE_NEGATION_CUES:
        if cue in left_clause:
            return True

    # POST negasyon: sağ clause'da ipucu var mı?
    for cue in POST_NEGATION_CUES:
        if cue in right_clause:
            return True

    return False


def filter_negated_entities(
    text: str,
    entities: List[str],
    pre_window: int = 5,
    post_window: int = 3,
) -> Tuple[List[str], List[str]]:
    """
    Entity listesini pozitif ve negatif olarak ayırır.

    Returns:
        (pozitif_entities, negatif_entities)

    Örnek:
        text = "hipertansiyon yok, diyabet mevcut"
        pos, neg = filter_negated_entities(text, ["hipertansiyon", "diyabet"])
        # pos = ["diyabet"], neg = ["hipertansiyon"]
    """
    positive, negative = [], []
    for entity in entities:
        if is_negated(text, entity, pre_window, post_window):
            negative.append(entity)
        else:
            positive.append(entity)
    return positive, negative


def analyze_negation_in_text(text: str, entities: List[str]) -> List[dict]:
    """
    Her entity için negasyon durumunu detaylı döner.

    Returns:
        [{"entity": str, "negated": bool, "left_ctx": str, "right_ctx": str}, ...]
    """
    text_lower = text.lower()
    results = []

    for entity in entities:
        entity_lower = entity.lower()
        negated = is_negated(text, entity)
        left_ctx = right_ctx = ""

        if entity_lower in text_lower:
            start = text_lower.find(entity_lower)
            end = start + len(entity_lower)
            left_ctx, right_ctx = _split_clause(text_lower, start, end)

        results.append({
            "entity": entity,
            "negated": negated,
            "left_ctx": left_ctx[-40:] if left_ctx else "",
            "right_ctx": right_ctx[:40] if right_ctx else "",
        })

    return results


# ──────────────────────────────────────────────
# HIZLI TEST
# ──────────────────────────────────────────────

# ==============================================================================
# --- FILE: morphology.py ---
# ==============================================================================

"""
morphology.py — Türkçe Tıbbi Kelime Kök Bulma
===============================================
Türkçe çekim eklerini (suffix) soyarak kök adayları üretir,
ardından tıbbi sözlükle fuzzy match yapar.

"diyabetli"      → "diyabet"    ✅
"hipertansiyona" → "hipertansiyon" ✅
"kanseri"        → "kanser"     ✅
"astımlı"        → "astım"      ✅

Yaklaşım:
  1. Olası Türkçe ekleri soy (en uzundan en kısaya)
  2. Kalan kökü tıbbi sözlükle karşılaştır
  3. Tam eşleşme veya fuzzy (Levenshtein ≤ 2) eşleşme → entity döner

Bağımlılık:
  pip install rapidfuzz   (opsiyonel, fuzzy match için)
  Yoksa sadece tam eşleşme yapılır.
"""

import re
from typing import Dict, List, Optional, Set, Tuple

# rapidfuzz opsiyonel
try:
    from rapidfuzz.distance import Levenshtein
    FUZZY_AVAILABLE = True
except ImportError:
    FUZZY_AVAILABLE = False

# ──────────────────────────────────────────────
# TÜRKÇE EK LİSTESİ (uzundan kısaya sıralı)
# ──────────────────────────────────────────────

# İsim çekim ekleri
NOUN_SUFFIXES: List[str] = [
    # Çoğul + hal
    "lardan", "lerden", "larda", "lerde", "lara", "lere",
    "ların", "lerin", "larla", "lerle", "ları", "leri",
    "lar", "ler",
    # Tekil hal ekleri (uzundan kısaya)
    "ndan", "nden", "nda", "nde", "nın", "nin", "nun", "nün",
    "dan", "den", "daki", "deki", "taki", "teki",
    "da", "de", "ta", "te",
    "na", "ne", "ya", "ye",
    "nla", "nle", "yla", "yle", "la", "le",
    "nı", "ni", "nu", "nü",
    "yi", "yı", "yu", "yü",
    "ı", "i", "u", "ü",
    "a", "e",
    # Sıfat/fiil yapım ekleri
    "sız", "siz", "suz", "süz",
    "lık", "lik", "luk", "lük",
    "sal", "sel",
    "lı", "li", "lu", "lü",
    "ımsı", "imsi",
]

# Fiilden isim yapım ekleri (hastalık bağlamında)
VERBAL_SUFFIXES: List[str] = [
    "mak", "mek", "ması", "mesi",
    "arak", "erek",
    "ıyor", "iyor", "uyor", "üyor",
    "dı", "di", "du", "dü", "tı", "ti", "tu", "tü",
    "mış", "miş", "muş", "müş",
]

ALL_SUFFIXES = NOUN_SUFFIXES + VERBAL_SUFFIXES

# ──────────────────────────────────────────────
# TEMEL FONKSİYONLAR
# ──────────────────────────────────────────────

def strip_suffixes(word: str, min_stem_length: int = 4) -> List[str]:
    """
    Türkçe eklerini soyarak olası kök adayları üretir.

    Args:
        word:            Giriş kelimesi (lowercase)
        min_stem_length: Köküm en az bu kadar karakter olmalı

    Returns:
        Olası kök listesi (özelden genele, kısa kökler sona)

    Örnek:
        >>> strip_suffixes("diyabetli")
        ["diyabetli", "diyabetl", "diyabet"]
    """
    word = word.lower().strip()
    candidates = [word]  # orijinali de ekle

    for suffix in sorted(ALL_SUFFIXES, key=len, reverse=True):
        if word.endswith(suffix) and len(word) - len(suffix) >= min_stem_length:
            stem = word[: len(word) - len(suffix)]
            if stem not in candidates:
                candidates.append(stem)
            # Ek soyulmuş köke de ek soy (yinelemeli olarak)
            for inner_suffix in sorted(NOUN_SUFFIXES, key=len, reverse=True):
                if stem.endswith(inner_suffix) and len(stem) - len(inner_suffix) >= min_stem_length:
                    inner_stem = stem[: len(stem) - len(inner_suffix)]
                    if inner_stem not in candidates:
                        candidates.append(inner_stem)

    return candidates


def find_medical_root(
    word: str,
    medical_vocabulary: Set[str],
    max_edit_distance: int = 2,
    min_stem_length: int = 4,
) -> Optional[str]:
    """
    Kelimenin tıbbi sözlükteki kökünü bulur.

    Algoritma:
        1. Önce tam eşleşme dene (orijinal kelime sözlükte var mı?)
        2. Suffix soy → kök adayları üret
        3. Her aday için: tam eşleşme → bulunursa döner
        4. Fuzzy eşleşme (rapidfuzz varsa): Levenshtein ≤ max_edit_distance

    Args:
        word:               Giriş kelimesi
        medical_vocabulary: Tıbbi terimler kümesi
        max_edit_distance:  Fuzzy eşleşme toleransı (0=kapalı)
        min_stem_length:    Minimum kök uzunluğu

    Returns:
        Sözlükteki eşleşen terim veya None

    Örnek:
        >>> vocab = {"diyabet", "hipertansiyon", "kanser"}
        >>> find_medical_root("diyabetli", vocab)
        "diyabet"
        >>> find_medical_root("hipertansiyona", vocab)
        "hipertansiyon"
    """
    word_lower = word.lower().strip()

    # 1. Tam eşleşme (orijinal kelime)
    if word_lower in medical_vocabulary:
        return word_lower

    # 2. Suffix soy → tam eşleşme
    candidates = strip_suffixes(word_lower, min_stem_length)
    for candidate in candidates:
        if candidate in medical_vocabulary:
            return candidate

    # 3. Fuzzy eşleşme (rapidfuzz)
    if FUZZY_AVAILABLE and max_edit_distance > 0:
        best_match = None
        best_dist = max_edit_distance + 1

        for candidate in candidates:
            for term in medical_vocabulary:
                # Uzunluk farkı çok büyükse atla (hız için)
                if abs(len(candidate) - len(term)) > max_edit_distance + 1:
                    continue
                dist = Levenshtein.distance(candidate, term)
                if dist <= max_edit_distance and dist < best_dist:
                    best_dist = dist
                    best_match = term

        return best_match

    return None


def extract_entities_with_morphology(
    tokens: List[str],
    medical_vocabulary: Set[str],
    max_edit_distance: int = 1,
) -> List[Tuple[str, str]]:
    """
    Token listesinde tıbbi sözlükle eşleşen kelimeleri bulur.
    Türkçe morfolojiyi dikkate alır.

    Args:
        tokens:            Kelime listesi
        medical_vocabulary: Tıbbi terimler kümesi
        max_edit_distance: Fuzzy tolerans

    Returns:
        [(orijinal_token, bulunan_terim), ...] listesi

    Örnek:
        >>> tokens = ["hasta", "diyabetli", "takipte"]
        >>> vocab = {"diyabet"}
        >>> extract_entities_with_morphology(tokens, vocab)
        [("diyabetli", "diyabet")]
    """
    matches = []
    for token in tokens:
        if len(token) < 4:
            continue
        found = find_medical_root(token, medical_vocabulary, max_edit_distance)
        if found:
            matches.append((token, found))
    return matches


def normalize_token(token: str, medical_vocabulary: Set[str]) -> str:
    """
    Çekimli token'ı sözlükteki kök formuna normalize eder.
    Bulunamazsa orijinali döner.

    Örnek:
        >>> normalize_token("kanseri", {"kanser"})
        "kanser"
        >>> normalize_token("xyz", {"kanser"})
        "xyz"
    """
    root = find_medical_root(token, medical_vocabulary, max_edit_distance=1)
    return root if root else token


# ──────────────────────────────────────────────
# ÇOKLU KELİMELİ ENTITY (bigram/trigram)
# ──────────────────────────────────────────────

def find_multiword_entities(
    text: str,
    multiword_vocabulary: Set[str],
    max_edit_distance: int = 1,
) -> List[str]:
    """
    Metinde çok kelimeli tıbbi terimleri bulur.
    Örnek: "kalp yetmezliği", "böbrek yetmezliği", "nefes darlığı"

    Args:
        text:                 Temizlenmiş Türkçe metin
        multiword_vocabulary: Çok kelimeli terimler kümesi
        max_edit_distance:    Fuzzy tolerans

    Returns:
        Bulunan çok kelimeli terimler listesi
    """
    found = []
    text_lower = text.lower()

    for term in multiword_vocabulary:
        if " " not in term:
            continue
        if term in text_lower:
            found.append(term)
        elif FUZZY_AVAILABLE and max_edit_distance > 0:
            # Basit window tabanlı fuzzy arama
            words = term.split()
            pattern = r"\b" + r"\W+".join(re.escape(w) for w in words) + r"\b"
            if re.search(pattern, text_lower):
                found.append(term)

    return found


# ──────────────────────────────────────────────
# HIZLI TEST
# ──────────────────────────────────────────────

# ==============================================================================
# --- FILE: summarizer.py ---
# ==============================================================================

"""
summarizer.py — Türkçe Tıbbi Metin Özetleme
=============================================
Uzun muayene/tedavi notlarını otomatik özetler.

Yaklaşım: Extractive (cümle seçimi)
  1. Metni cümlelere böl
  2. Her cümle için TF-IDF skoru hesapla
  3. Tıbbi anahtar kelimelere ek ağırlık ver (boost)
  4. En yüksek skorlu N cümleyi seç (orijinal sırayla döndür)

Bağımlılık: sadece sklearn (zaten kurulu)
"""

import re
from typing import List, Optional, Set

from sklearn.feature_extraction.text import TfidfVectorizer

# ──────────────────────────────────────────────
# TIBBİ BOOST KELİMELERİ
# ──────────────────────────────────────────────
# Bu kelimeleri içeren cümleler özetde öncelikli yer alır.

MEDICAL_BOOST_TERMS: Set[str] = {
    # Tanı
    "tanı", "tani", "diagnosis", "icd",
    # Semptom
    "şikayet", "belirti", "semptom", "yakınma",
    "ağrı", "bulantı", "ateş", "yorgunluk", "nefes darlığı",
    # Tedavi
    "tedavi", "ilaç", "reçete", "doz", "kullanıyor",
    "başlandı", "kesildi", "değiştirildi",
    # Hastalık durumu
    "kanser", "diyabet", "hipertansiyon", "koah", "astım",
    "inme", "kalp", "böbrek", "karaciğer",
    # Klinik bulgular
    "muayene", "bulgu", "sonuç", "değer", "normal", "anormal",
    "yüksek", "düşük", "artmış", "azalmış",
    # Önem bildiren
    "kritik", "acil", "önemli", "dikkat", "risk",
    "kontrol", "takip", "planlanan",
}


# ──────────────────────────────────────────────
# CÜMLE BÖLME
# ──────────────────────────────────────────────

def _split_sentences(text: str) -> List[str]:
    """
    Türkçe tıbbi metni cümlelere böler.
    Nokta, ünlem, soru işareti sonrası bölünür.
    Kısa cümleler (< 10 karakter) atlanır.
    """
    # Satır sonu ve noktalama sonrası bol
    raw = re.split(r"(?<=[.!?])\s+|(?<=\n)\s*", text)
    sentences = []
    for s in raw:
        s = s.strip()
        if len(s) >= 10:  # çok kısa cümleleri atla
            sentences.append(s)
    return sentences


# ──────────────────────────────────────────────
# TF-IDF CÜMLE SKORLAMA
# ──────────────────────────────────────────────

def _score_sentences_tfidf(sentences: List[str]) -> List[float]:
    """
    Her cümle için TF-IDF tabanlı önem skoru üretir.

    Yöntem:
    - TF-IDF matrisi hesapla (cümle × kelime)
    - Her cümlenin skoru: o cümledeki TF-IDF değerlerinin ortalaması
    - Tıbbi boost: MEDICAL_BOOST_TERMS içeren kelimeler varsa +0.2 ekle

    Returns:
        Her cümle için float skor listesi (yüksek = önemli)
    """
    if len(sentences) == 0:
        return []
    if len(sentences) == 1:
        return [1.0]

    try:
        vectorizer = TfidfVectorizer(
            analyzer="word",
            token_pattern=r"[a-zçğıöşü]{3,}",
            max_df=0.95,
            min_df=1,
            sublinear_tf=True,
        )
        tfidf_matrix = vectorizer.fit_transform(
            [s.lower() for s in sentences]
        )
        feature_names = vectorizer.get_feature_names_out()
    except ValueError:
        # Çok az kelime — eşit skor ver
        return [1.0] * len(sentences)

    scores = []
    for i, sentence in enumerate(sentences):
        row = tfidf_matrix[i]
        # Temel skor: TF-IDF ortalama (sıfır olmayan değerlerin)
        nonzero = row.data
        base_score = float(nonzero.mean()) if len(nonzero) > 0 else 0.0

        # Tıbbi boost
        sentence_lower = sentence.lower()
        boost = 0.0
        for term in MEDICAL_BOOST_TERMS:
            if term in sentence_lower:
                boost += 0.05  # her bulunan terim için +0.05

        scores.append(base_score + min(boost, 0.3))  # boost'u 0.3 ile sınırla

    return scores


# ──────────────────────────────────────────────
# ANA ÖZETLEME FONKSİYONLARI
# ──────────────────────────────────────────────

def extractive_summarize(
    text: str,
    n_sentences: int = 3,
    min_score: float = 0.0,
    preserve_order: bool = True,
) -> str:
    """
    TF-IDF tabanlı extractive özetleme.
    En önemli cümleleri seçer ve döndürür.

    Args:
        text:           Özetlenecek Türkçe tıbbi metin
        n_sentences:    Seçilecek maximum cümle sayısı
        min_score:      Bu skorun altındaki cümleler dahil edilmez
        preserve_order: True → orijinal cümle sırası korunur

    Returns:
        Özet metin (seçilen cümleler birleştirilmiş)

    Örnek:
        >>> note = "Hasta 5 yıldır diyabet tanısı ile takip edilmektedir. Bugün rutin kontrol için geldi. Kan şekeri yüksek seyrediyor."
        >>> extractive_summarize(note, n_sentences=2)
        "Hasta 5 yıldır diyabet tanısı ile takip edilmektedir. Kan şekeri yüksek seyrediyor."
    """
    if not text or not text.strip():
        return ""

    sentences = _split_sentences(text)

    if len(sentences) == 0:
        return ""
    if len(sentences) <= n_sentences:
        return " ".join(sentences)

    scores = _score_sentences_tfidf(sentences)

    # (skor, orijinal_index, cümle) üçlüsü oluştur
    scored = [(score, i, sent) for i, (sent, score) in enumerate(zip(sentences, scores))]

    # Skora göre sırala (büyükten küçüğe)
    scored.sort(key=lambda x: x[0], reverse=True)

    # Top-N seç, min_score filtresi uygula
    selected = [
        (score, idx, sent)
        for score, idx, sent in scored[:n_sentences]
        if score >= min_score
    ]

    if not selected:
        # Hiçbir şey seçilemediyse ilk cümleyi döndür
        return sentences[0]

    # Orijinal sıraya geri döndür
    if preserve_order:
        selected.sort(key=lambda x: x[1])

    return " ".join(sent for _, _, sent in selected)


def summarize_patient_note(
    note: str,
    note_type: str = "genel",
    n_sentences: int = 3,
) -> dict:
    """
    Hasta notunu özetler ve meta bilgi döndürür.

    Args:
        note:         Ham not metni
        note_type:    "muayene" | "tedavi" | "ozgecmis" | "genel"
        n_sentences:  Özette kaç cümle olsun

    Returns:
        {
          "ozet": str,
          "orijinal_uzunluk": int,
          "ozet_uzunluk": int,
          "sikistirma_orani": float,   # 1.0 = hiç sıkıştırma
          "cümle_sayisi": int,
          "seçilen_cümle_sayisi": int,
        }
    """
    if not note or not note.strip():
        return {
            "ozet": "",
            "orijinal_uzunluk": 0,
            "ozet_uzunluk": 0,
            "sikistirma_orani": 0.0,
            "cumle_sayisi": 0,
            "secilen_cumle_sayisi": 0,
        }

    sentences = _split_sentences(note)
    ozet = extractive_summarize(note, n_sentences=n_sentences)

    orijinal_len = len(note)
    ozet_len = len(ozet)

    return {
        "ozet": ozet,
        "not_turu": note_type,
        "orijinal_uzunluk": orijinal_len,
        "ozet_uzunluk": ozet_len,
        "sikistirma_orani": round(ozet_len / orijinal_len, 2) if orijinal_len > 0 else 0.0,
        "cumle_sayisi": len(sentences),
        "secilen_cumle_sayisi": min(n_sentences, len(sentences)),
    }


def summarize_multiple_visits(
    visit_notes: List[str],
    n_sentences_per_visit: int = 2,
    max_total_sentences: int = 6,
) -> str:
    """
    Birden fazla ziyaret notunu birleştirir ve özetler.

    Args:
        visit_notes:           Ziyaret notu listesi (kronolojik sırada)
        n_sentences_per_visit: Her ziyaretten kaç cümle alınsın
        max_total_sentences:   Toplam maksimum cümle sayısı

    Returns:
        Birleştirilmiş özet metin
    """
    if not visit_notes:
        return ""

    all_summaries = []
    for note in visit_notes:
        if note and note.strip():
            summary = extractive_summarize(note, n_sentences=n_sentences_per_visit)
            if summary:
                all_summaries.append(summary)

    combined = " ".join(all_summaries)
    # Toplam azaltma
    return extractive_summarize(combined, n_sentences=max_total_sentences)


# ──────────────────────────────────────────────
# KEYWORD DENSİTY ANALİZİ (bonus)
# ──────────────────────────────────────────────

def get_key_phrases(text: str, top_n: int = 10) -> List[tuple]:
    """
    Metindeki en önemli anahtar ifadeleri TF-IDF ile bulur.

    Returns:
        [(kelime, skor), ...] listesi (yüksek skordan düşüğe)
    """
    if not text or not text.strip():
        return []

    sentences = _split_sentences(text)
    if not sentences:
        return []

    try:
        vectorizer = TfidfVectorizer(
            analyzer="word",
            token_pattern=r"[a-zçğıöşü]{4,}",
            ngram_range=(1, 2),  # tek ve iki kelimeli ifadeler
            max_df=0.90,
            min_df=1,
            sublinear_tf=True,
        )
        tfidf_matrix = vectorizer.fit_transform([s.lower() for s in sentences])
        feature_names = vectorizer.get_feature_names_out()

        # Tüm cümlelerdeki ortalama TF-IDF
        mean_scores = tfidf_matrix.mean(axis=0).A1
        phrase_scores = list(zip(feature_names, mean_scores))
        phrase_scores.sort(key=lambda x: x[1], reverse=True)

        # Tıbbi boost
        boosted = []
        for phrase, score in phrase_scores[:top_n * 3]:
            boost = 0.1 if any(term in phrase for term in MEDICAL_BOOST_TERMS) else 0.0
            boosted.append((phrase, round(score + boost, 4)))

        boosted.sort(key=lambda x: x[1], reverse=True)
        return boosted[:top_n]

    except ValueError:
        return []


# ──────────────────────────────────────────────
# HIZLI TEST
# ──────────────────────────────────────────────

# ==============================================================================
# --- FILE: model_ner.py ---
# ==============================================================================

"""
model_ner.py — HuggingFace BERTurk Tabanlı Türkçe NER
======================================================
`savasy/bert-base-turkish-ner-cased` modelini kullanarak
genel Türkçe NER (Kişi, Yer, Organizasyon) yapar.

Tıbbi pipeline ile HIBRİT ENTEGRASYON:
  1. BERTurk NER → Kişi/Yer/Org entity'lerini temizle
  2. Keyword NER (mevcut) → Hastalık/İlaç/Semptom
  → İki çıktı birleştirilir, tekrarlar çıkarılır.

BERTurk bu modelin etiket seti:
  PER  → Kişi (hasta adı, hekim adı)
  LOC  → Konum (hastane, şehir)
  ORG  → Kurum (klinik, bölüm)

Not: Bu model tıbbi NER için eğitilmemiştir.
Hastalık/ilaç tespiti mevcut keyword pipeline'da kalır.
"""

import os
import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

# ──────────────────────────────────────────────
# MODEL YÜKLEME (lazy — ilk kullanımda)
# ──────────────────────────────────────────────

_MODEL_NAME = "savasy/bert-base-turkish-ner-cased"
_ner_pipeline = None
_TRANSFORMERS_AVAILABLE = False

try:
    from transformers import pipeline as hf_pipeline
    _TRANSFORMERS_AVAILABLE = True
except ImportError:
    pass


def _load_model(model_name: str = _MODEL_NAME):
    """
    HuggingFace NER pipeline'ını lazy olarak yükler.
    İlk çağrıdan sonra önbelleklenir.
    """
    global _ner_pipeline
    if _ner_pipeline is not None:
        return _ner_pipeline

    if not _TRANSFORMERS_AVAILABLE:
        raise ImportError(
            "transformers kurulu değil.\n"
            "pip install transformers torch"
        )

    print(f"[BERTurk NER] Model yükleniyor: {model_name} ...")
    _ner_pipeline = hf_pipeline(
        task="ner",
        model=model_name,
        aggregation_strategy="simple",
        device=-1,  # CPU (GPU için 0 yaz)
    )
    print("[BERTurk NER] Model yüklendi ✓")
    return _ner_pipeline


# ──────────────────────────────────────────────
# ENTITY ÇIKIŞLARI
# ──────────────────────────────────────────────

@dataclass
class BERTurkNERResult:
    """BERTurk NER çıktısı."""
    persons: List[str] = field(default_factory=list)    # PER → hasta/hekim adı
    locations: List[str] = field(default_factory=list)  # LOC → hastane, şehir
    orgs: List[str] = field(default_factory=list)       # ORG → klinik, bölüm
    raw_entities: List[Dict] = field(default_factory=list)  # ham HuggingFace çıktısı
    model_used: str = ""
    fallback_used: bool = False


# ──────────────────────────────────────────────
# ETİKET SINIFLANDIRICI
# ──────────────────────────────────────────────

# HuggingFace model etiket alanları → iç kategoriler
_LABEL_MAP = {
    "PER": "persons",
    "PERSON": "persons",
    "LOC": "locations",
    "LOCATION": "locations",
    "ORG": "orgs",
    "ORGANIZATION": "orgs",
}

# Tıbbi bağlamda anlamsız kısa entity'ler
_NOISE_ENTITIES = {
    "hasta", "doktor", "hekim", "dr", "prof", "op",
    "servis", "klinik", "bölüm", "hastane",
}


def _clean_entity(text: str) -> str:
    """Subword token artefaktlarını temizler (## gibi)."""
    text = re.sub(r"##", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


# ──────────────────────────────────────────────
# ANA FONKSİYONLAR
# ──────────────────────────────────────────────

def extract_bertturk_entities(
    text: str,
    min_score: float = 0.75,
    min_length: int = 2,
) -> BERTurkNERResult:
    """
    BERTurk modeli ile metinden NER yapar.

    Args:
        text:       Türkçe tıbbi metin
        min_score:  Bu güven eşiğinin altındaki entity'ler atlanır
        min_length: Bu uzunluğun altındaki entity'ler atlanır

    Returns:
        BERTurkNERResult nesnesi

    Örnek:
        >>> r = extract_bertturk_entities("Dr. Ahmet Yılmaz hasta İstanbul'dan geldi.")
        >>> r.persons  # ["Ahmet Yılmaz"]
        >>> r.locations  # ["İstanbul"]
    """
    result = BERTurkNERResult(model_used=_MODEL_NAME)

    if not text or not text.strip():
        return result

    # Model yükle (lazy)
    try:
        ner = _load_model()
    except (ImportError, Exception) as e:
        # Fallback: boş sonuç döndür, pipeline keyword NER kullanmaya devam eder
        result.fallback_used = True
        result.model_used = f"fallback (hata: {e})"
        return result

    # Uzun metinleri parçalara böl (BERT 512 token limiti)
    chunks = _chunk_text(text, max_chars=400)
    all_raw: List[Dict] = []

    for chunk in chunks:
        try:
            entities = ner(chunk)
            all_raw.extend(entities)
        except Exception:
            continue

    result.raw_entities = all_raw

    # Sınıflandır
    seen = set()
    for ent in all_raw:
        label = ent.get("entity_group", ent.get("entity", "")).upper()
        entity_text = _clean_entity(ent.get("word", ""))
        score = ent.get("score", 0.0)

        # Filtreler
        if score < min_score:
            continue
        if len(entity_text) < min_length:
            continue
        if entity_text.lower() in _NOISE_ENTITIES:
            continue
        if entity_text in seen:
            continue

        seen.add(entity_text)
        category = _LABEL_MAP.get(label, None)

        if category == "persons":
            result.persons.append(entity_text)
        elif category == "locations":
            result.locations.append(entity_text)
        elif category == "orgs":
            result.orgs.append(entity_text)

    return result


def _chunk_text(text: str, max_chars: int = 400) -> List[str]:
    """Uzun metni cümle sınırlarında böler."""
    if len(text) <= max_chars:
        return [text]

    sentences = re.split(r"(?<=[.!?])\s+", text)
    chunks, current = [], ""
    for sent in sentences:
        if len(current) + len(sent) + 1 > max_chars:
            if current:
                chunks.append(current.strip())
            current = sent
        else:
            current = f"{current} {sent}".strip()
    if current:
        chunks.append(current.strip())

    return chunks if chunks else [text[:max_chars]]


# ──────────────────────────────────────────────
# HIBRİT NER: BERTurk + Keyword
# ──────────────────────────────────────────────

def hybrid_extract(
    text: str,
    keyword_diseases: List[str] = None,
    keyword_drugs: List[Dict] = None,
    keyword_symptoms: List[str] = None,
    min_score: float = 0.75,
) -> Dict:
    """
    BERTurk NER + Keyword NER sonuçlarını birleştirir.

    Katmanlı strateji:
    - BERTurk → Kişi, Kurum, Lokasyon (genel Türkçe entity)
    - Keyword  → Hastalık, İlaç, Semptom (tıbbi domain)

    Args:
        text:              Ham metin
        keyword_diseases:  Keyword NER'den gelen hastalıklar
        keyword_drugs:     Keyword NER'den gelen ilaçlar
        keyword_symptoms:  Keyword NER'den gelen semptomlar
        min_score:         BERTurk için güven eşiği

    Returns:
        {
          "diseases":  [...],   # keyword sonucu
          "drugs":     [...],   # keyword sonucu
          "symptoms":  [...],   # keyword sonucu
          "persons":   [...],   # BERTurk sonucu
          "locations": [...],   # BERTurk sonucu
          "orgs":      [...],   # BERTurk sonucu
          "model_available": bool,
        }
    """
    bert_result = extract_bertturk_entities(text, min_score=min_score)

    return {
        # Tıbbi entity'ler → keyword NER'den
        "diseases": keyword_diseases or [],
        "drugs": keyword_drugs or [],
        "symptoms": keyword_symptoms or [],
        # Genel entity'ler → BERTurk'ten
        "persons": bert_result.persons,
        "locations": bert_result.locations,
        "orgs": bert_result.orgs,
        # Meta
        "model_available": not bert_result.fallback_used,
        "model_used": bert_result.model_used,
    }


# ──────────────────────────────────────────────
# PIPELINE ENTEGRASYON (nlp_pipeline.py için)
# ──────────────────────────────────────────────

def enrich_summary_with_bert(summary: dict, note_text: str) -> dict:
    """
    Mevcut hasta özetine BERTurk NER çıktısını ekler.

    Kullanım (nlp_pipeline.py içinde):
        summary = generate_patient_summary(row, icd_codes)
        summary = enrich_summary_with_bert(summary, combined_note_text)

    Args:
        summary:   generate_patient_summary() çıktısı
        note_text: Muayene + tedavi notu birleşimi

    Returns:
        Güncellenmiş summary dict
    """
    bert = extract_bertturk_entities(note_text)

    summary["nlp_kisi_adlari"] = bert.persons        # hasta/hekim adları
    summary["nlp_kurumlar"] = bert.orgs               # klinik, bölüm
    summary["nlp_konumlar"] = bert.locations          # şehir, hastane
    summary["nlp_model_aktif"] = not bert.fallback_used

    return summary


# ──────────────────────────────────────────────
# HIZLI TEST
# ──────────────────────────────────────────────



# ==============================================================================
# --- FILE: nlp_pipeline.py ---
# ==============================================================================

"""
ACUHIT NLP Pipeline - Tıbbi Türkçe Metin İşleme
================================================
Bu modül aşağıdaki işlemleri yapar:
1. Tıbbi Türkçe metni temizler ve normalize eder
2. ICD-10 tanı kodlarından hastalık tespiti
3. Serbest metinden hastalık/ilaç/semptom NER
   - JSON sözlük tabanlı (420+ hastalık, 210+ semptom, 310+ ilaç)
   - Türkçe morfoloji ile çekimli form tespiti
   - Negasyon tespiti ("hipertansiyon yok" → negatif entity)
4. Kohort ve reçete analizi
"""

import json
import os
import re
import string
import unicodedata
import warnings
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set, Tuple

import pandas as pd

warnings.filterwarnings("ignore")

_MODULES_AVAILABLE = True


# ─────────────────────────────────────────────
# JSON SÖZLÜK YÜKLEME
# ─────────────────────────────────────────────

_DICT_DIR = "/Users/suleymantalha/Documents/ACUHIT 2/nlp/dictionaries"


def _load_flat_set(json_path: str) -> Set[str]:
    """JSON sözlüğünü düz bir küme (set) olarak yükler."""
    if not os.path.exists(json_path):
        return set()
    with open(json_path, encoding="utf-8") as f:
        data = json.load(f)
    flat: Set[str] = set()

    def _extract(obj):
        if isinstance(obj, str) and not obj.startswith("_"):
            flat.add(obj.lower())
        elif isinstance(obj, list):
            for item in obj:
                _extract(item)
        elif isinstance(obj, dict):
            for k, v in obj.items():
                if not k.startswith("_"):
                    _extract(v)

    _extract(data)
    return flat


def _load_drug_dict(json_path: str) -> Dict[str, str]:
    """
    İlaç JSON'ını {ilaç_adı: sınıf} dict'ine çevirir.

    İki JSON formatını destekler:
      v1 (eski): {"kategori": ["ilaç1", "ilaç2"]}
      v2 (TİTCK): {"kategori": {"ticari_adlar": [...], "etken_maddeler": [...]}}
    """
    if not os.path.exists(json_path):
        return {}
    with open(json_path, encoding="utf-8") as f:
        data = json.load(f)
    drug_map: Dict[str, str] = {}

    def _walk(obj, category="Diger"):
        if isinstance(obj, list):
            for item in obj:
                if isinstance(item, str) and item.strip():
                    drug_map[item.lower().strip()] = category
        elif isinstance(obj, dict):
            # v2 format: {"ticari_adlar": [...], "etken_maddeler": [...]}
            if "ticari_adlar" in obj or "etken_maddeler" in obj:
                for subkey in ("ticari_adlar", "etken_maddeler"):
                    for item in obj.get(subkey, []):
                        if isinstance(item, str) and item.strip():
                            drug_map[item.lower().strip()] = category
            else:
                # v1 format veya nested dict
                for k, v in obj.items():
                    if not k.startswith("_"):
                        _walk(v, k)

    _walk(data)
    return drug_map


# Sözlükler yükleniyor
DISEASE_VOCAB: Set[str] = _load_flat_set(os.path.join(_DICT_DIR, "diseases_tr.json"))
SYMPTOM_VOCAB: Set[str] = _load_flat_set(os.path.join(_DICT_DIR, "symptoms_tr.json"))
DRUG_VOCAB: Dict[str, str] = _load_drug_dict(os.path.join(_DICT_DIR, "drugs_tr.json"))

# ─────────────────────────────────────────────
# 1. METİN TEMİZLEME & NORMALIZE
# ─────────────────────────────────────────────

# Türkçe tıbbi yazım düzeltme sözlüğü
TYPO_CORRECTIONS = {
    "aktıf": "aktif",
    "sınovıt": "sinovit",
    "dogal": "doğal",
    "olsun": "olsun",
    "nöroşirürji": "nöroşirürji",
    "matofın": "metformin",
    "lyrica": "pregabalin",
    "concor": "bisoprolol",
    "nexium": "esomeprazol",
    "plaquanil": "hidroksiklorokin",
    "lansor": "lansoprazol",
    "moduretic": "amilorid+hidroklorotiyazid",
}

# Anlamsız/boş ifadeler
NOISE_PATTERNS = [
    r"\boff med\b",
    r"\btakıp\b",
    r"\bN/A\b",
    r"\bnanometer\b",
    r"^\s*\.\s*$",
    r"^\s*,\s*$",
    r"^\s*-\s*$",
]


def normalize_turkish(text: str) -> str:
    """Türkçe metni Unicode NFC formuna normalize eder."""
    if not isinstance(text, str):
        return ""
    return unicodedata.normalize("NFC", text)


def clean_medical_text(text: str) -> str:
    """
    Tıbbi Türkçe metni temizler:
    - Özel karakterleri kaldırır
    - Noktalama iyileştirir
    - Tekrar eden boşlukları temizler
    - Kısaltmaları düzeltir
    - Küçük harfe çevirir
    """
    if not isinstance(text, str) or text.strip() == "":
        return ""

    text = normalize_turkish(text)
    text = text.lower()

    # Yaygın tıbbi kısaltma genişleteleri
    text = re.sub(r"\bdx\b", "tanı", text)
    text = re.sub(r"\bhx\b", "öykü", text)
    text = re.sub(r"\btx\b", "tedavi", text)
    text = re.sub(r"\brx\b", "reçete", text)
    text = re.sub(r"\bca\b", "kanser", text)  # kanser bağlamında
    text = re.sub(r"\bht\b", "hipertansiyon", text)
    text = re.sub(r"\bdm\b", "diyabet", text)
    text = re.sub(r"\bkah\b", "koroner arter hastalığı", text)
    text = re.sub(r"\bkbb\b", "kulak burun boğaz", text)

    # Yazım düzeltmeleri
    for wrong, correct in TYPO_CORRECTIONS.items():
        text = re.sub(r"\b" + wrong + r"\b", correct, text)

    # Gürültülü kalıpları kaldır
    for pattern in NOISE_PATTERNS:
        text = re.sub(pattern, " ", text, flags=re.IGNORECASE)

    # Birden fazla noktalama temizle
    text = re.sub(r"[,;:]{2,}", ",", text)
    text = re.sub(r"\.{2,}", ".", text)

    # Tekrar eden boşlukları temizle
    text = re.sub(r"\s+", " ", text).strip()

    return text


# ─────────────────────────────────────────────
# 2. TÜRKÇE TIBBİ STOP WORDS
# ─────────────────────────────────────────────

MEDICAL_STOP_WORDS = {
    "ve", "veya", "ile", "bu", "şu", "o", "bir", "de", "da", "ki",
    "için", "olan", "olan", "gibi", "kadar", "ise", "en", "çok",
    "var", "yok", "her", "bazı", "herhangi", "aynı", "diğer",
    "hastada", "hastanın", "hasta", "doktor", "hekim", "muayene",
    "notu", "kontrol", "tedavi", "geçmişi", "belirtisi", "başlangıç",
    "mevcut", "bulgu", "değer", "test", "sonuç", "rapor", "normal",
    "anormal", "evet", "hayır", "geçirdi", "kullanıyor", "takip",
    "önerilen", "önerildi", "yapıldı", "planlandı", "görüldü",
}


def tokenize_medical_text(text: str) -> List[str]:
    """Metni tokenlere ayırır, stop words'leri kaldırır."""
    text = clean_medical_text(text)
    tokens = re.findall(r"[a-zçğıöşü]{3,}", text)
    return [t for t in tokens if t not in MEDICAL_STOP_WORDS]


# ─────────────────────────────────────────────
# 3. ICD-10 TANIKODU PARSER
# ─────────────────────────────────────────────

# ICD-10 büyük kategori haritası
ICD10_CHAPTERS = {
    "A": "Enfeksiyon Hastalıkları",
    "B": "Enfeksiyon Hastalıkları",
    "C": "Kanser / Neoplazmlar",
    "D": "Kan & Hematoloji",
    "E": "Endokrin & Metabolizma",
    "F": "Psikiyatri & Mental",
    "G": "Sinir Sistemi",
    "H": "Göz & Kulak",
    "I": "Kardiyovasküler",
    "J": "Solunum Sistemi",
    "K": "Sindirim Sistemi",
    "L": "Deri Hastalıkları",
    "M": "Kas-İskelet & Romatizma",
    "N": "Ürogenital Sistem",
    "O": "Gebelik & Doğum",
    "P": "Perinatal",
    "Q": "Konjenital Anomaliler",
    "R": "Semptomlar & Bulgular",
    "S": "Yaralanma & Travma",
    "T": "Zehirlenme",
    "U": "COVID-19 & Özel",
    "V": "Dış Nedenler",
    "Z": "Sağlık Durumu (Z-kodu)",
}

# Kanser alt kodları (C00-C97)
CANCER_SUBTYPES = {
    "C50": "Meme Kanseri",
    "C34": "Akciğer Kanseri",
    "C18": "Kolon Kanseri",
    "C61": "Prostat Kanseri",
    "C25": "Pankreas Kanseri",
    "C22": "Karaciğer Kanseri",
    "C56": "Over Kanseri",
    "C64": "Böbrek Kanseri",
    "C67": "Mesane Kanseri",
    "C43": "Melanoma",
    "C73": "Tiroid Kanseri",
    "C91": "Lösemi (Lenfositik)",
    "C71": "Beyin Tümörü",
    "C15": "Özofagus Kanseri",
    "C16": "Mide Kanseri",
    "C20": "Rektum Kanseri",
}


def parse_icd10_codes(raw_codes: str) -> List[Dict]:
    """
    TUM_EPS_TANILAR kolonunu parse eder.
    Örnek: 'C50, I10, E11' → [{code, category, chapter_name}, ...]
    """
    if not isinstance(raw_codes, str) or raw_codes.strip() == "":
        return []

    results = []
    codes = re.findall(r"[A-Z]\d{2}(?:\.\d+)?", raw_codes.upper())

    for code in codes:
        chapter = code[0]
        chapter_name = ICD10_CHAPTERS.get(chapter, "Bilinmeyen")
        # Kanser alt türü kontrolü
        subtype = None
        if chapter == "C":
            prefix = code[:3]
            subtype = CANCER_SUBTYPES.get(prefix, f"Kanser ({prefix})")

        results.append({
            "code": code,
            "chapter": chapter,
            "category": chapter_name,
            "cancer_subtype": subtype,
            "is_cancer": chapter == "C",
            "is_chronic": chapter in ["I", "E", "J", "M", "N", "G", "K"],
        })
    return results


def get_dominant_diseases(icd_list: List[Dict]) -> Counter:
    """ICD listesinden en sık kategorileri çıkarır."""
    counter = Counter()
    for item in icd_list:
        counter[item["category"]] += 1
    return counter


# ─────────────────────────────────────────────
# 4. TIBBİ NER (SÖZLÜK TABANLI)
# ─────────────────────────────────────────────

# Legacy inline sözlükler (backward compat + fallback)
DISEASE_KEYWORDS = DISEASE_VOCAB or {
    "hipertansiyon", "diyabet", "kanser", "astim", "inme",
    "kalp yetmezligi", "bobrek yetmezligi", "epilepsi",
}
SYMPTOM_KEYWORDS = SYMPTOM_VOCAB or {
    "agri", "bulanti", "kusma", "ates", "yorgunluk",
    "nefes darligi", "oksuruk", "bas donmesi",
}

# Pattern tabanlı ilaç tespiti (suffix fallback)
DRUG_PATTERNS = {
    r"\b\w+statin\b": "Statin",
    r"\b\w+pril\b": "ACE Inhibitor",
    r"\b\w+sartan\b": "ARB",
    r"\b\w+olol\b": "Beta Bloker",
    r"\b\w+mycin\b": "Antibiyotik",
    r"\b\w+cillin\b": "Penisilin",
    r"\b\w+floxacin\b": "Florokinolon",
}


@dataclass
class NERResult:
    """NER sonuçlarını taşır."""
    diseases: List[str] = field(default_factory=list)          # Pozitif hastalıklar
    negated_diseases: List[str] = field(default_factory=list)  # Negatif hastalıklar
    drugs: List[Dict] = field(default_factory=list)
    symptoms: List[str] = field(default_factory=list)          # Pozitif semptomlar
    negated_symptoms: List[str] = field(default_factory=list)  # Negatif semptomlar
    raw_text: str = ""


def extract_medical_entities(text: str, apply_negation: bool = True) -> NERResult:
    """
    Serbest metinden tıbbi varlıkları çıkarır.

    Geliştirmeler:
    - JSON sözlük tabanlı: 420+ hastalık, 210+ semptom, 310+ ilaç
    - Türkçe morfoloji: çekimli formlar da yakalanır ("diyabetli" → "diyabet")
    - Çok kelimeli entity: "kalp yetmezliği", "nefes darlığı"
    - Negasyon: "hipertansiyon yok" → negated_diseases'a alır

    Args:
        text:           Ham Türkçe tıbbi metin
        apply_negation: False ise negasyon filtresi devre dışı
    """
    result = NERResult(raw_text=text)
    if not text:
        return result

    cleaned = clean_medical_text(text)
    tokens = tokenize_medical_text(text)

    # ── 1. Hastalık Tespiti ──
    disease_vocab = DISEASE_VOCAB if DISEASE_VOCAB else DISEASE_KEYWORDS
    multiword_diseases: List[str] = [t for t in disease_vocab if " " in t and t in cleaned]
    single_vocab = {t for t in disease_vocab if " " not in t}
    single_diseases: List[str] = []
    for token in tokens:
        if _MODULES_AVAILABLE:
            root = find_medical_root(token, single_vocab, max_edit_distance=1)
            if root:
                single_diseases.append(root)
        else:
            if token in single_vocab:
                single_diseases.append(token)

    all_diseases = list(set(multiword_diseases + single_diseases))

    if apply_negation and _MODULES_AVAILABLE:
        pos_d, neg_d = filter_negated_entities(cleaned, all_diseases)
        result.diseases = pos_d
        result.negated_diseases = neg_d
    else:
        result.diseases = all_diseases

    # ── 2. Semptom Tespiti ──
    symptom_vocab = SYMPTOM_VOCAB if SYMPTOM_VOCAB else SYMPTOM_KEYWORDS
    multiword_symptoms = [t for t in symptom_vocab if " " in t and t in cleaned]
    single_sym_vocab = {t for t in symptom_vocab if " " not in t}
    single_symptoms: List[str] = []
    for token in tokens:
        if _MODULES_AVAILABLE:
            root = find_medical_root(token, single_sym_vocab, max_edit_distance=1)
            if root:
                single_symptoms.append(root)
        else:
            if token in single_sym_vocab:
                single_symptoms.append(token)

    all_symptoms = list(set(multiword_symptoms + single_symptoms))

    if apply_negation and _MODULES_AVAILABLE:
        pos_s, neg_s = filter_negated_entities(cleaned, all_symptoms)
        result.symptoms = pos_s
        result.negated_symptoms = neg_s
    else:
        result.symptoms = all_symptoms

    # ── 3. İlaç Tespiti ──
    # 3A. JSON sözlükten tam eşleşme
    if DRUG_VOCAB:
        for token in tokens:
            if token in DRUG_VOCAB:
                result.drugs.append({"name": token, "class": DRUG_VOCAB[token]})
        for drug_name, drug_class in DRUG_VOCAB.items():
            if " " in drug_name and drug_name in cleaned:
                result.drugs.append({"name": drug_name, "class": drug_class})

    # 3B. Pattern tabanlı fallback
    for pattern, drug_class in DRUG_PATTERNS.items():
        matches = re.findall(pattern, cleaned, re.IGNORECASE)
        for match in matches:
            if isinstance(match, str) and len(match) > 3:
                if not any(d["name"] == match for d in result.drugs):
                    result.drugs.append({"name": match, "class": drug_class})

    # 3C. Büyük harf reçete ilaçları (ÖZEL DURUM: Sadece hepsi büyük harfle yazılmışsa çok fazla False Positive oluyor)
    # Eğer metnin tamamı veya büyük kısmı BÜYÜK HARF ise bu kuralı iptal et.
    words = [w for w in text.split() if w.isalpha()]
    upper_words = [w for w in words if w.isupper()]
    is_all_caps_note = len(words) > 0 and (len(upper_words) / len(words)) > 0.5
    
    if not is_all_caps_note:
        EXCLUDE_CAPS = {"HASTA", "DOKTOR", "MUAYENE", "ONERILDI", "YAPILDI",
                        "SERVIS", "KLINIK", "BOLUM", "SIKAYET", "TANI", "TEDAVI", "YOK", "VAR"}
        for name in re.findall(r"\b[A-ZÇĞIÖŞÜ]{4,}\b", text):
            if name not in EXCLUDE_CAPS:
                if not any(d["name"].lower() == name.lower() for d in result.drugs):
                    result.drugs.append({"name": name.title(), "class": "Recete Ilaci"})

    # Tekrar edenleri kaldır
    seen = set()
    unique_drugs = []
    for d in result.drugs:
        key = d["name"].lower()
        if key not in seen:
            seen.add(key)
            unique_drugs.append(d)
    result.drugs = unique_drugs

    return result



# ─────────────────────────────────────────────
# 6. HASTA ÖZET OLUŞTURUCU
# ─────────────────────────────────────────────

def generate_patient_summary(row: pd.Series, icd_codes: List[Dict]) -> Dict:
    """
    Doktor ekranı için hasta özeti oluşturur.

    İçerir:
    - Ana hastalıklar (ICD + NER)
    - Mevcut şikayetler + tespit edilen entity'ler
    - Vital bulgular
    - Kullandığı ilaçlar
    - Ameliyat geçmişi
    - Muayene ve tedavi notlarının otomatik özeti
    - Anahtar tıbbi ifadeler
    """
    summary = {}

    # Temel bilgiler
    summary["hasta_id"] = row.get("HASTA_ID", "Bilinmiyor")
    summary["yas"] = row.get("TANI_YASI", "?")
    summary["cinsiyet"] = row.get("CINSIYET", "?")
    summary["servis"] = row.get("SERVISADI", "?")
    summary["gelis_tarihi"] = row.get("EPISODE_TARIH", "?")

    # Ana tanılar
    cancer_codes = [c for c in icd_codes if c["is_cancer"]]
    chronic_codes = [c for c in icd_codes if c["is_chronic"]]

    summary["ana_tanilar"] = list(set([
        c.get("cancer_subtype") or c["category"] for c in (cancer_codes + chronic_codes)[:5]
    ]))

    # Tam ICD kodu listesi
    summary["tum_tani_kodlari"] = [c["code"] for c in icd_codes]
    summary["tani_kategorileri"] = dict(Counter([c["category"] for c in icd_codes]))

    # Şikayetler
    yakinma = row.get("YAKINMA", "")
    oykü = row.get("ÖYKÜ", "")
    combined = f"{yakinma} {oykü}".strip()
    ner = extract_medical_entities(combined)

    summary["sikayet"] = clean_medical_text(yakinma) if isinstance(yakinma, str) else ""
    summary["tespit_edilen_semptomlar"] = ner.symptoms[:10]
    summary["negated_semptomlar"] = ner.negated_symptoms[:5]
    summary["tespit_edilen_hastaliklar"] = ner.diseases[:10]
    summary["negated_hastaliklar"] = ner.negated_diseases[:5]

    # Vital bulgular
    vitals = {}
    for vital in ["SPO2", "Nabız", "KB-S", "KB-D", "BMI", "Boy", "Kilo"]:
        if vital in row.index:
            val = row[vital]
            if pd.notna(val):
                try:
                    vitals[vital] = float(val)
                except (ValueError, TypeError):
                    vitals[vital] = str(val)
    summary["vital_bulgular"] = vitals

    # İlaçlar
    ilac_col = row.get("Sürekli Kullandığı İlaçlar", "")
    ilaclar_raw = clean_medical_text(str(ilac_col)) if isinstance(ilac_col, str) else ""
    ilaclar_listesi = [i.strip() for i in re.split(r"[,;\n]", ilaclar_raw) if len(i.strip()) > 2]
    summary["surekli_ilaclar"] = ilaclar_listesi[:15]

    # Tedavi notu + otomatik özet
    tedavi = row.get("Tedavi Notu", "")
    tedavi_temiz = clean_medical_text(str(tedavi)) if isinstance(tedavi, str) else ""
    summary["tedavi_notu"] = tedavi_temiz[:500]
    summary["tedavi_ozeti"] = extractive_summarize(tedavi_temiz, n_sentences=2) if len(tedavi_temiz) > 100 else tedavi_temiz

    # Muayene notu + otomatik özet
    muayene = row.get("Muayene Notu", "")
    muayene_temiz = clean_medical_text(str(muayene)) if isinstance(muayene, str) else ""
    summary["muayene_notu"] = muayene_temiz[:500]
    summary["muayene_ozeti"] = extractive_summarize(muayene_temiz, n_sentences=2) if len(muayene_temiz) > 100 else muayene_temiz

    # Anahtar tıbbi ifadeler (tüm notları birleştirerek)
    all_text = " ".join(filter(None, [tedavi_temiz, muayene_temiz, combined]))
    summary["anahtar_ifadeler"] = [phrase for phrase, _ in get_key_phrases(all_text, top_n=8)]

    # Ameliyat geçmişi
    ameliyat = row.get("Ameliyat Geçmişi", "")
    summary["ameliyat_gecmisi"] = str(ameliyat) if pd.notna(ameliyat) else "Yok"

    # Kronik durumlar
    kronik_flags = {}
    for col in ["Hipertansiyon Hastada", "Kalp Damar Hastada", "Diyabet Hastada",
                "Kan Hastalıkları Hastada"]:
        if col in row.index:
            val = row[col]
            if pd.notna(val) and str(val).strip() not in ["", "0", "nan"]:
                kronik_flags[col] = str(val)
    summary["kronik_durumlar"] = kronik_flags

    # Sigara/Alkol
    summary["sigara"] = row.get("Sigara", "Belirtilmemiş")
    summary["alkol"] = row.get("Alkol", "Belirtilmemiş")
    summary["alerji"] = row.get("Alerji", "Yok")
    summary["ilac_alerjisi"] = row.get("ilaç Alerjisi", "Yok")

    # BERTurk NER: hasta adı, hekim adı, hastane, şehir tespiti
    # (sadece metin sütunları varsa çalıştır, yavaş olduğu için opsiyonel)
    bert_note = " ".join(filter(None, [
        str(row.get("YAKINMA", "")),
        str(row.get("Muayene Notu", "")),
        str(row.get("Tedavi Notu", "")),
    ])).strip()
    if bert_note and _MODULES_AVAILABLE:
        summary = enrich_summary_with_bert(summary, bert_note[:800])

    return summary





# ─────────────────────────────────────────────
# 8. HASTA KOHORTu TOPLU ANALİZ
# ─────────────────────────────────────────────

def analyze_cohort_diseases(df: pd.DataFrame, top_n: int = 20) -> Dict:
    """
    Tüm kohort için en yaygın hastalıkları bulur.
    
    Returns:
        {
          'top_categories': Counter,
          'top_icd_codes': Counter,
          'cancer_subtypes': Counter,
          'text_based_diseases': Counter
        }
    """
    all_icd_parsed = []
    text_disease_counter = Counter()
    icd_code_counter = Counter()
    category_counter = Counter()
    cancer_subtype_counter = Counter()

    for _, row in df.iterrows():
        # ICD kodlarını parse et
        icd_raw = row.get("TUM_EPS_TANILAR", "")
        parsed = parse_icd10_codes(str(icd_raw))
        for p in parsed:
            icd_code_counter[p["code"]] += 1
            category_counter[p["category"]] += 1
            if p["cancer_subtype"]:
                cancer_subtype_counter[p["cancer_subtype"]] += 1

        # Serbest metinden hastalık tespiti
        for col in ["YAKINMA", "Muayene Notu", "Tedavi Notu", "Özgeçmiş Notu"]:
            text = row.get(col, "")
            if isinstance(text, str) and text.strip():
                ner = extract_medical_entities(text)
                for d in ner.diseases:
                    text_disease_counter[d] += 1

    return {
        "top_categories": category_counter.most_common(top_n),
        "top_icd_codes": icd_code_counter.most_common(top_n),
        "cancer_subtypes": cancer_subtype_counter.most_common(top_n),
        "text_based_diseases": text_disease_counter.most_common(top_n),
    }


# ─────────────────────────────────────────────
# 9. REÇETE NLP ANALİZİ
# ─────────────────────────────────────────────

def analyze_prescriptions(recete_df: pd.DataFrame) -> Dict:
    """
    Reçete verisini analiz eder:
    - En sık reçete edilen ilaçlar
    - İlaç sınıfı dağılımı
    - Hasta başına ortalama ilaç sayısı
    """
    if recete_df.empty:
        return {}

    drug_counter = Counter(recete_df["İlaç Adı"].dropna().str.upper())
    
    # İlaç sınıfı tahmini
    drug_classes = Counter()
    for drug_name in recete_df["İlaç Adı"].dropna():
        drug_lower = drug_name.lower()
        classified = False
        for pattern, drug_class in DRUG_PATTERNS.items():
            if re.search(pattern, drug_lower):
                drug_classes[drug_class] += 1
                classified = True
                break
        if not classified:
            drug_classes["Diğer"] += 1

    # Hasta başına ilaç sayısı
    drugs_per_patient = recete_df.groupby("HASTA_ID")["İlaç Adı"].count()

    return {
        "top_drugs": drug_counter.most_common(20),
        "drug_classes": dict(drug_classes.most_common()),
        "avg_drugs_per_patient": round(drugs_per_patient.mean(), 2),
        "max_drugs_per_patient": int(drugs_per_patient.max()),
    }


# ─────────────────────────────────────────────
# 10. ANA PIPELINE RUNNER
# ─────────────────────────────────────────────

class MedicalNLPPipeline:
    """
    Tüm NLP işlemlerini koordine eden ana sınıf.

    Tüm veri setlerini otomatik tarar:
      - Cancer - Data/Cancer_Anadata/ca_anadata_*.csv
      - Check-Up - Data/Check_Up_Anadata/Anadata_*.csv
      - Ex - Data/Ex_Anadata/ex_anadata_*.csv
      - Reçete / Lab dosyaları da pattern ile

    Kullanım:
        pipeline = MedicalNLPPipeline(data_dir="/path/to/ACUHIT 2", sample_per_file=5000)
        pipeline.load_all_data()
        results = pipeline.run_full_analysis()
    """

    # Veri klasörü → glob pattern eşlemesi
    ANADATA_PATTERNS = [
        "Cancer - Data/Cancer_Anadata/ca_anadata_*.csv",
        "Check-Up - Data/Check_Up_Anadata/Anadata_*.csv",
        "Ex - Data/Ex_Anadata/ex_anadata_*.csv",
    ]
    RECETE_PATTERNS = [
        "Cancer - Data/Cancer_Recete/ca_recete_*.csv",
        "Check-Up - Data/Check_Up_Recete/prescriptions_*.csv",
    ]
    LAB_PATTERNS = [
        "Cancer - Data/Cancer_Lab/ca_lab_*.csv",
        "Check-Up - Data/Check_Up_Lab/lab_*.csv",
    ]

    def __init__(
        self,
        data_dir: str = None,
        sample_per_file: int = 5000,
        sample_size: int = None,      # geriye uyumluluk
    ):
        import glob as _glob
        self._glob = _glob

        # data_dir: verilen path veya bu dosyadan 2 üst klasör
        if data_dir:
            self.data_dir = data_dir
        else:
            self.data_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

        # Geriye uyumluluk: eski sample_size parametresi
        self.sample_per_file = sample_size if sample_size else sample_per_file

        self.df_cancer: Optional[pd.DataFrame] = None
        self.df_recete: Optional[pd.DataFrame] = None
        self.df_lab:    Optional[pd.DataFrame] = None
        self._loaded = False
        self._file_stats: List[Dict] = []  # yüklenen dosya istatistikleri

    # ── Yardımcı: pattern'den dosya listesi ──────────────────
    def _resolve_files(self, patterns: List[str]) -> List[str]:
        """Glob pattern'lerinden mevcut dosyaları döner (sıralı)."""
        files = []
        for pat in patterns:
            full_pat = os.path.join(self.data_dir, pat)
            found = sorted(self._glob.glob(full_pat))
            files.extend(found)
        return files

    # ── Tek tip veri setini yükle ─────────────────────────────
    def _load_csv_files(
        self,
        files: List[str],
        label: str,
        sample_per_file: int,
    ) -> Optional[pd.DataFrame]:
        """
        Verilen dosyaları okur, her birinden sample_per_file satır alır,
        hepsini birleştirir. Sütun uyumsuzluğu varsa ortak sütunları alır.
        """
        if not files:
            print(f"[NLP] {label}: dosya bulunamadı.")
            return None

        frames = []
        total_rows = 0
        for f in files:
            try:
                chunk = pd.read_csv(
                    f,
                    nrows=sample_per_file,
                    low_memory=False,
                    encoding="utf-8",
                    on_bad_lines="skip",
                )
                frames.append(chunk)
                total_rows += len(chunk)
                self._file_stats.append({
                    "label": label,
                    "file": os.path.basename(f),
                    "rows": len(chunk),
                })
                print(f"  [OK] {os.path.basename(f):45s} {len(chunk):>8,} satır")
            except Exception as e:
                print(f"  [HATA] {os.path.basename(f)}: {e}")

        if not frames:
            return None

        # Ortak sütunları bul — farklı şemalı dosyalar varsa
        common_cols = set(frames[0].columns)
        for df in frames[1:]:
            common_cols &= set(df.columns)

        if len(set(len(df.columns) for df in frames)) > 1:
            print(f"  [UYARI] {label}: sütun sayıları farklı → ortak {len(common_cols)} sütun kullanılıyor.")
            frames = [df[sorted(common_cols)] for df in frames]

        combined = pd.concat(frames, ignore_index=True)
        print(f"  ── {label} toplam: {total_rows:,} satır ({len(files)} dosya) ──")
        return combined

    # ── Ana veri yükleme metodu ───────────────────────────────
    def load_all_data(
        self,
        load_recete: bool = True,
        load_lab: bool = False,        # Lab büyük, default kapalı
    ) -> "MedicalNLPPipeline":
        """
        Tüm anadata, reçete (ve opsiyonel lab) dosyalarını yükler.
        Chaining destekler: pipeline.load_all_data().run_full_analysis()
        """
        print(f"[NLP] Veri dizini: {self.data_dir}")
        print(f"[NLP] Dosya başına örnekleme: {self.sample_per_file:,} satır\n")

        # Anadata
        anadata_files = self._resolve_files(self.ANADATA_PATTERNS)
        print(f"[NLP] Anadata ({len(anadata_files)} dosya):")
        self.df_cancer = self._load_csv_files(anadata_files, "Anadata", self.sample_per_file)

        # Reçete
        if load_recete:
            recete_files = self._resolve_files(self.RECETE_PATTERNS)
            print(f"\n[NLP] Reçete ({len(recete_files)} dosya):")
            self.df_recete = self._load_csv_files(recete_files, "Recete", self.sample_per_file)

        # Lab (opsiyonel)
        if load_lab:
            lab_files = self._resolve_files(self.LAB_PATTERNS)
            print(f"\n[NLP] Lab ({len(lab_files)} dosya):")
            self.df_lab = self._load_csv_files(lab_files, "Lab", self.sample_per_file)

        self._loaded = True

        # Özet
        print("\n" + "─" * 55)
        if self.df_cancer is not None:
            print(f"  Toplam anadata satırı : {len(self.df_cancer):>12,}")
            if "HASTA_ID" in self.df_cancer.columns:
                print(f"  Benzersiz hasta       : {self.df_cancer['HASTA_ID'].nunique():>12,}")
        if self.df_recete is not None:
            print(f"  Toplam reçete satırı  : {len(self.df_recete):>12,}")
        print("─" * 55)

        return self

    # ── Geriye uyumluluk: eski load_data() arayüzü ───────────
    def load_data(
        self,
        anadata_path: str,
        recete_path: str = None,
        lab_path: str = None,
    ) -> None:
        """
        Eski tek dosya arayüzü — geriye uyumluluk için korundu.
        Yeni kod için load_all_data() kullanın.
        """
        print(f"[NLP] (Tekli mod) Anadata: {anadata_path}")
        self.df_cancer = pd.read_csv(anadata_path, nrows=self.sample_per_file, low_memory=False)
        print(f"[NLP] {len(self.df_cancer):,} satır yüklendi.")
        if recete_path:
            self.df_recete = pd.read_csv(recete_path, nrows=self.sample_per_file, low_memory=False)
        if lab_path:
            self.df_lab = pd.read_csv(lab_path, nrows=self.sample_per_file, low_memory=False)
        self._loaded = True

    # ── Tam Analiz ────────────────────────────────────────────
    def run_full_analysis(self) -> Dict:
        """Tüm NLP analizlerini çalıştırır ve sonuçları döner."""
        if not self._loaded:
            raise RuntimeError("Önce load_all_data() veya load_data() çağırın.")

        print("[NLP] Kohort hastalık analizi başlıyor...")
        cohort = analyze_cohort_diseases(self.df_cancer)

        print("[NLP] Hasta özetleri oluşturuluyor (ilk 100 satır)...")
        summaries = []
        for _, row in self.df_cancer.head(100).iterrows():
            icd_codes = parse_icd10_codes(str(row.get("TUM_EPS_TANILAR", "")))
            summary = generate_patient_summary(row, icd_codes)
            summaries.append(summary)

        print("[NLP] Reçete analizi...")
        rx_analysis = {}
        if self.df_recete is not None:
            rx_analysis = analyze_prescriptions(self.df_recete)

        total_patients = 0
        if "HASTA_ID" in self.df_cancer.columns:
            total_patients = self.df_cancer["HASTA_ID"].nunique()

        return {
            "cohort_analysis": cohort,
            "patient_summaries": summaries,
            "prescription_analysis": rx_analysis,
            "total_patients": total_patients,
            "total_episodes": len(self.df_cancer),
            "file_stats": self._file_stats,
        }

    # ── Tek Hasta Dashboard ───────────────────────────────────
    def get_patient_dashboard(self, hasta_id: str) -> Dict:
        """Tek hastanın dashboard verisini döner."""
        patient_rows = self.df_cancer[self.df_cancer["HASTA_ID"] == hasta_id]
        if patient_rows.empty:
            return {"error": f"Hasta bulunamadı: {hasta_id}"}

        latest = patient_rows.sort_values("EPISODE_TARIH").iloc[-1]
        icd_codes = parse_icd10_codes(str(latest.get("TUM_EPS_TANILAR", "")))
        summary = generate_patient_summary(latest, icd_codes)

        return {
            "summary": summary,
            "total_visits": len(patient_rows),
        }

    # ── YAKINMA'dan Semptom Sözlüğü Üret ────────────────────
    def build_symptom_vocab(
        self,
        text_cols: List[str] = None,
        top_n: int = 500,
        min_freq: int = 10,
        out_path: str = None,
    ) -> Dict[str, List[str]]:
        """
        Gerçek hasta notlarından (YAKINMA, Muayene Notu vb.) semptom
        kelime dağarcığı çıkarır ve symptoms_tr.json'ı günceller.

        Args:
            text_cols:  Taranacak metin kolonları
            top_n:      En sık N kelimeyi al
            min_freq:   En az bu kadar tekrarlanan kelimeler
            out_path:   Çıktı JSON yolu (None → dictionaries/symptoms_tr.json)
        """
        import json
        if self.df_cancer is None:
            raise RuntimeError("Önce load_all_data() çağırın.")

        if text_cols is None:
            text_cols = ["YAKINMA", "Muayene Notu", "Tedavi Notu", "Özgeçmiş Notu"]
        text_cols = [c for c in text_cols if c in self.df_cancer.columns]

        if not text_cols:
            print("[UYARI] Belirtilen metin kolonları bulunamadı.")
            return {}

        print(f"[NLP] Semptom sözlüğü çıkarılıyor ({text_cols})...")

        word_counter: Counter = Counter()
        for col in text_cols:
            for text in self.df_cancer[col].dropna():
                tokens = tokenize_medical_text(str(text))
                word_counter.update(tokens)

        # Minimum frekans filtresi
        filtered = [
            (word, freq)
            for word, freq in word_counter.most_common(top_n * 3)
            if freq >= min_freq and len(word) >= 3
        ]

        # İlaç ve hastalık sözlükleriyle çakışanları çıkar (zaten başka yerde var)
        symptom_candidates = [
            word for word, _ in filtered
            if word not in DISEASE_VOCAB and word not in DRUG_VOCAB
        ][:top_n]

        out = {
            "_meta": {
                "version": "2.0",
                "source": "ACUHIT Gerçek Hasta Notları (YAKINMA + Muayene Notu)",
                "columns_used": text_cols,
                "total_analyzed": len(self.df_cancer),
                "min_frequency": min_freq,
                "term_count": len(symptom_candidates),
            },
            "semptomlar": symptom_candidates,
        }

        if out_path is None:
            out_path = os.path.join(_DICT_DIR, "symptoms_tr.json")

        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=2)

        print(f"[OK] symptoms_tr.json güncellendi: {len(symptom_candidates)} terim → {out_path}")
        print(f"     En sık 20: {symptom_candidates[:20]}")
        return out


# ─────────────────────────────────────────────
# TEST / DEMO
# ─────────────────────────────────────────────

if __name__ == "__main__":
    import json

    DATA_DIR = "/Users/suleymantalha/Documents/ACUHIT 2"

    # ── Tüm veri setlerini yükle ──
    pipeline = MedicalNLPPipeline(
        data_dir=DATA_DIR,
        sample_per_file=2000,   # Her dosyadan 2000 satır → toplam ~20k satır
    )
    pipeline.load_all_data(load_recete=True, load_lab=False)

    # ── Semptom sözlüğünü gerçek veriden üret ──
    pipeline.build_symptom_vocab(min_freq=5, top_n=400)

    # ── Tam analiz ──
    results = pipeline.run_full_analysis()

    print("\n" + "="*60)
    print("EN YAYGIN TANI KATEGORİLERİ (TOP 10)")
    print("="*60)
    for cat, count in results["cohort_analysis"]["top_categories"][:10]:
        print(f"  {cat}: {count}")

    print("\n" + "="*60)
    print("KANSER ALT TÜRLERİ")
    print("="*60)
    for sub, count in results["cohort_analysis"]["cancer_subtypes"][:10]:
        print(f"  {sub}: {count}")

    print("\n" + "="*60)
    print("ÖRNEK HASTA ÖZETİ (ilk hasta)")
    print("="*60)
    if results["patient_summaries"]:
        s = results["patient_summaries"][0]
        print(f"  Hasta ID   : {s['hasta_id']}")
        print(f"  Yaş        : {s['yas']}")
        print(f"  Cinsiyet   : {s['cinsiyet']}")
        print(f"  Servis     : {s['servis']}")
        print(f"  Ana Tanılar: {s['ana_tanilar']}")
        print(f"  Şikayet    : {s['sikayet']}")
        print(f"  Vital      : {s['vital_bulgular']}")
        print(f"  İlaçlar    : {s['surekli_ilaclar']}")

    print("\n" + "="*60)
    print("REÇETE ANALİZİ")
    print("="*60)
    rx = results["prescription_analysis"]
    if rx:
        print(f"  Hasta başına ort. ilaç: {rx.get('avg_drugs_per_patient', '-')}")
        print(f"  En sık 5 ilaç:")
        for drug, cnt in (rx.get("top_drugs") or [])[:5]:
            print(f"    {drug}: {cnt}")

    print(f"\n[TOPLAM] {results['total_patients']:,} hasta, "
          f"{results['total_episodes']:,} epizot analiz edildi.")