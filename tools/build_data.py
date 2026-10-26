#!/usr/bin/env python3
"""
Gera os arquivos de dados do app Bíblia & Exegese (data/livros/<abrev>.json).

Fontes (todas livres):
  - Hebraico: OpenScriptures Hebrew Bible (morphhb) - WLC domínio público; lemas e morfologia CC BY 4.0
  - Léxico Strong (hebraico e grego): openscriptures/strongs - domínio público
  - Septuaginta: CenterBLC/LXX (Rahlfs 1935) - MIT
  - Português: Bíblia Livre (BLIVRE), Diego Santos, Mario Sérgio e Marco Teles - CC BY 4.0
    (texto obtido do corpus eBible, porbr2018)

Uso:
  python3 build_data.py <pasta_fontes> <pasta_saida> Gen [Exod ...]
  pasta_fontes deve conter: morphhb/, strongs/, LXX/, vref.txt, por.txt
"""
import json, re, sys, os, unicodedata
from collections import defaultdict, Counter
import xml.etree.ElementTree as ET

SRC, OUT = sys.argv[1], sys.argv[2]
WANT = sys.argv[3:] or ['Gen']

OSHB_BOOKS = ['Gen','Exod','Lev','Num','Deut','Josh','Judg','1Sam','2Sam','1Kgs','2Kgs','Isa','Jer','Ezek',
  'Hos','Joel','Amos','Obad','Jonah','Mic','Nah','Hab','Zeph','Hag','Zech','Mal','Ps','Prov','Job','Song',
  'Ruth','Lam','Eccl','Esth','Dan','Ezra','Neh','1Chr','2Chr']
LXX_NAME = {b: b for b in OSHB_BOOKS}
LXX_NAME.update({'Eccl': 'Qoh', 'Song': 'Cant', 'Dan': 'DanTh', 'Ezra': None, 'Neh': None})
VREF_NAME = {'Gen':'GEN','Exod':'EXO','Lev':'LEV','Num':'NUM','Deut':'DEU','Josh':'JOS','Judg':'JDG','Ruth':'RUT',
  '1Sam':'1SA','2Sam':'2SA','1Kgs':'1KI','2Kgs':'2KI','1Chr':'1CH','2Chr':'2CH','Ezra':'EZR','Neh':'NEH','Esth':'EST',
  'Job':'JOB','Ps':'PSA','Prov':'PRO','Eccl':'ECC','Song':'SNG','Isa':'ISA','Jer':'JER','Lam':'LAM','Ezek':'EZK',
  'Dan':'DAN','Hos':'HOS','Joel':'JOL','Amos':'AMO','Obad':'OBA','Jonah':'JON','Mic':'MIC','Nah':'NAM','Hab':'HAB',
  'Zeph':'ZEP','Hag':'HAG','Zech':'ZEC','Mal':'MAL'}
APP_ABBR = {'Gen':'Gn','Exod':'Ex','Lev':'Lv','Num':'Nm','Deut':'Dt'}

# ---------------------------------------------------------------- hebraico
NS = {'o': 'http://www.bibletechnologies.net/2003/OSIS/namespace'}

def main_strong(lemma):
    """'b/7225' -> 'H7225'; '1254 a' -> 'H1254'"""
    parts = [p.strip() for p in lemma.split('/')]
    nums = [re.match(r'(\d+)', p) for p in parts]
    nums = [m.group(1) for m in nums if m]
    return 'H' + nums[-1] if nums else None

def load_oshb(book):
    tree = ET.parse(os.path.join(SRC, 'morphhb/wlc', book + '.xml'))
    verses = {}
    for v in tree.iter('{%s}verse' % NS['o']):
        _, c, n = v.get('osisID').split('.')
        words = []
        for w in v.iter('{%s}w' % NS['o']):
            words.append({'t': w.text or '', 'lemma': w.get('lemma', ''), 'morph': w.get('morph', '')})
        verses[(int(c), int(n))] = words
    return verses

# transliteração acadêmica simplificada
CONS = {'א':'ʾ','ב':'b','ג':'g','ד':'d','ה':'h','ו':'w','ז':'z','ח':'ḥ','ט':'ṭ','י':'y','כ':'k','ך':'k','ל':'l',
  'מ':'m','ם':'m','נ':'n','ן':'n','ס':'s','ע':'ʿ','פ':'p','ף':'p','צ':'ṣ','ץ':'ṣ','ק':'q','ר':'r','ש':'š','ת':'t'}
V = {'ַ':'a','ָ':'ā','ֵ':'ē','ֶ':'e','ִ':'i','ֹ':'ō','ֺ':'ō','ֻ':'u',
  'ֱ':'ĕ','ֲ':'ă','ֳ':'ŏ','ׇ':'o'}
SHEVA, DAGESH, SHIN, SIN = 'ְ', 'ּ', 'ׁ', 'ׂ'

def translit(word):
    word = word.replace('/', '').replace('־', '-')
    word = ''.join(ch for ch in word if not ('֑' <= ch <= '֯' or ch in 'ֽ׀׃ֿׅׄ'))
    # agrupa: letra + diacríticos
    clusters = []
    for ch in word:
        if ch in CONS or ch == '-':
            clusters.append([ch, ''])
        elif clusters:
            clusters[-1][1] += ch
    out = []
    prev_vowel = False
    n = len(clusters)
    for i, (c, marks) in enumerate(clusters):
        if c == '-':
            out.append('-'); prev_vowel = False; continue
        nxt = clusters[i+1] if i + 1 < n else None
        last = (i == n - 1) or (nxt and nxt[0] == '-')
        # matres lectionis
        if c == 'ו' and marks == DAGESH and (i == 0 or not any(m in V for m in clusters[i-1][1])):
            out.append('û'); prev_vowel = True; continue
        if c == 'ו' and marks == 'ֹ' and i > 0:
            out.append('ô'); prev_vowel = True; continue
        if c == 'י' and marks == '' and i > 0 and clusters[i-1][1] and clusters[i-1][1][-1] in 'ִֵֶ':
            pv = clusters[i-1][1][-1]
            out[-1] = out[-1][:-1] + {'ִ':'î','ֵ':'ê','ֶ':'ê'}[pv]
            prev_vowel = True; continue
        if c == 'ה' and last and DAGESH not in marks and not marks:
            if out and out[-1] and out[-1][-1] in 'āeē':
                out[-1] = out[-1][:-1] + {'ā':'â','e':'ê','ē':'ê'}[out[-1][-1]]
                continue
        if c == 'א' and not marks and i > 0 and not last:
            pass
        cons = CONS[c]
        if c == 'ש':
            cons = 'ś' if SIN in marks else 'š'
        if DAGESH in marks and prev_vowel and c not in 'ה':
            cons = cons + cons
        vow = ''
        for m in marks:
            if m in V:
                vow = V[m]
        furtive = last and c in 'חעה' and marks.endswith('ַ') and i > 0 and clusters[i-1][1]
        if SHEVA in marks and not vow:
            vocal = (i == 0) or (i > 0 and SHEVA in clusters[i-1][1]) or (DAGESH in marks and prev_vowel)
            vow = 'ᵊ' if vocal and not last else ''
        if furtive:
            out.append('a' + cons)
        else:
            out.append(cons + vow)
        prev_vowel = bool(vow) and vow != 'ᵊ'
    s = ''.join(out)
    if s in ('yᵊhwâ', 'yᵊhwih', 'yᵊhōwâ', 'yhwh'):
        s = 'YHWH'
    return s

# ---------------------------------------------------------------- morfologia em português
H_STEM = {'q':'Qal','N':'Nifal','p':'Piel','P':'Pual','h':'Hifil','H':'Hofal','t':'Hitpael','o':'Polel','O':'Polal',
  'r':'Hitpolel','m':'Poel','M':'Poal','k':'Palel','K':'Pulal','Q':'Qal passivo','l':'Pilpel','L':'Polpal',
  'f':'Hitpalpel','D':'Nitpael','j':'Pealal','i':'Pilel','u':'Hotpaal','c':'Tiftil','v':'Hishtafel','w':'Nitpaal',
  'y':'Nitpoel','z':'Hitpoel'}
A_STEM = {'q':'Peal','Q':'Peil','u':'Hitpeel','N':'Nifal','p':'Pael','P':'Ithpaal','M':'Hitpaal','a':'Afel',
  'h':'Hafel','s':'Safel','e':'Shafel','H':'Hofal','i':'Itpeel','t':'Hishtafal','v':'Ishtafal','w':'Hitafal',
  'o':'Polel','z':'Ithpoel','m':'Poel','r':'Hitpolel','f':'Hitpalpel','b':'Hafel passivo','c':'Tiftil','x':'Ithpeel'}
H_TYPE = {'p':'perfeito','q':'perfeito consecutivo (weqatal)','i':'imperfeito','w':'imperfeito consecutivo (wayyiqtol)',
  'h':'coortativo','j':'jussivo','v':'imperativo','r':'particípio ativo','s':'particípio passivo',
  'a':'infinitivo absoluto','c':'infinitivo construto'}
GEN = {'m':'masc.','f':'fem.','b':'ambos os gêneros','c':'comum'}
NUM = {'s':'sing.','p':'pl.','d':'dual'}
STATE = {'a':'absoluto','c':'construto','d':'determinado'}
PERS = {'1':'1ª p.','2':'2ª p.','3':'3ª p.'}

def gns(code):
    out = []
    for ch, tab in zip(code, (GEN, NUM, STATE)):
        if ch in tab: out.append(tab[ch])
    return ' '.join(out)

def pgn(code):
    out = []
    for ch, tab in zip(code, (PERS, GEN, NUM)):
        if ch in tab: out.append(tab[ch])
    return ' '.join(out)

def heb_seg(seg, aram=False):
    if not seg: return ''
    p, r = seg[0], seg[1:]
    if p == 'N':
        kind = {'c':'substantivo comum','g':'substantivo gentílico','p':'nome próprio'}.get(r[:1], 'substantivo')
        return (kind + ' ' + gns(r[1:])).strip()
    if p == 'V':
        stem = (A_STEM if aram else H_STEM).get(r[:1], r[:1])
        t = r[1:2]
        typ = H_TYPE.get(t, t)
        rest = r[2:]
        if t in 'rs':
            return f'verbo {stem} {typ} {gns(rest)}'.strip()
        if t in 'ac':
            return f'verbo {stem} {typ}'
        return f'verbo {stem} {typ} {pgn(rest)}'.strip()
    if p == 'A':
        kind = {'a':'adjetivo','c':'numeral cardinal','g':'adjetivo gentílico','o':'numeral ordinal'}.get(r[:1], 'adjetivo')
        return (kind + ' ' + gns(r[1:])).strip()
    if p == 'P':
        kind = {'d':'pronome demonstrativo','f':'pronome indefinido','i':'pronome interrogativo','p':'pronome pessoal','r':'pronome relativo'}.get(r[:1], 'pronome')
        return (kind + ' ' + pgn(r[1:])).strip()
    if p == 'R':
        return 'preposição' + (' + artigo' if r[:1] == 'd' else '')
    if p == 'C': return 'conjunção'
    if p == 'D': return 'advérbio'
    if p == 'T':
        return {'a':'partícula afirmativa','d':'artigo definido','e':'partícula exortativa','i':'partícula interrogativa',
          'j':'interjeição','m':'partícula demonstrativa','n':'partícula negativa','o':'marcador de objeto direto',
          'r':'partícula relativa'}.get(r[:1], 'partícula')
    if p == 'S':
        if r[:1] == 'p': return 'sufixo pronominal ' + pgn(r[1:])
        return {'d':'sufixo direcional','h':'he paragógico','n':'nun paragógico'}.get(r[:1], 'sufixo')
    return seg

def heb_morph(code):
    if not code: return ''
    aram = code[0] == 'A'
    segs = code[1:].split('/')
    return ' + '.join(heb_seg(s, aram) for s in segs if s)

G_TENSE = {'P':'presente','I':'imperfeito','F':'futuro','A':'aoristo','X':'perfeito','Y':'mais-que-perfeito'}
G_VOICE = {'A':'ativo','M':'médio','P':'passivo'}
G_MOOD = {'I':'indicativo','D':'imperativo','S':'subjuntivo','O':'optativo','N':'infinitivo','P':'particípio'}
G_CASE = {'N':'nominativo','G':'genitivo','D':'dativo','A':'acusativo','V':'vocativo'}
G_NUM = {'S':'sing.','P':'pl.','D':'dual'}
G_GEN = {'M':'masc.','F':'fem.','N':'neutro'}

def cng(code):
    out = []
    for ch, tab in zip(code, (G_CASE, G_NUM, G_GEN)):
        if ch in tab: out.append(tab[ch])
    return ' '.join(out)

def greek_morph(code):
    if not code: return ''
    pos, _, rest = code.partition('.')
    if pos == 'V':
        t, v, m = rest[:1], rest[1:2], rest[2:3]
        base = f'verbo {G_TENSE.get(t,t)} {G_VOICE.get(v,v)} {G_MOOD.get(m,m)}'
        tail = rest[3:]
        if m == 'P': return base + ' ' + cng(tail)
        if m == 'N': return base
        pers = {'1':'1ª p.','2':'2ª p.','3':'3ª p.'}.get(tail[:1], '')
        return (base + ' ' + pers + ' ' + G_NUM.get(tail[1:2], '')).strip()
    name = {'N':'substantivo','A':'adjetivo','RA':'artigo','RP':'pronome pessoal','RD':'pronome demonstrativo',
      'RR':'pronome relativo','RI':'pronome interrogativo/indefinido','RX':'pronome','C':'conjunção','D':'advérbio',
      'P':'preposição','X':'partícula','I':'interjeição','M':'numeral'}.get(pos, pos)
    return (name + ' ' + cng(rest)).strip()

# ---------------------------------------------------------------- Strong
def load_js_dict(path):
    s = open(path, encoding='utf-8').read()
    s = s[s.index('{'): s.rindex('}') + 1]
    return json.loads(s)

HEB = load_js_dict(os.path.join(SRC, 'strongs/hebrew/strongs-hebrew-dictionary.js'))
GRK = load_js_dict(os.path.join(SRC, 'strongs/greek/strongs-greek-dictionary.js'))

def root_of(h):
    e = HEB.get(h)
    if not e: return None
    d = e.get('derivation', '') or ''
    if 'primitive root' in d or 'primitive word' in d: return h
    m = re.search(r'H(\d+)', d)
    return 'H' + m.group(1) if m else None

# ---------------------------------------------------------------- LXX
from tf.fabric import Fabric
TF = Fabric(locations=os.path.join(SRC, 'LXX/tf/1935'), silent='deep')
api = TF.load('book chapter verse word translit_SBL lex_utf8 strongs morphology', silent='deep')
F, L, T = api.F, api.L, api.T
LXX = defaultdict(dict)
for v in F.otype.s('verse'):
    b, c, n = T.sectionFromNode(v)
    ws = []
    for w in L.d(v, 'word'):
        ws.append({'g': F.word.v(w), 'tr': F.translit_SBL.v(w), 'lex': unicodedata.normalize('NFC', F.lex_utf8.v(w) or ''),
                   's': F.strongs.v(w) or '', 'm': F.morphology.v(w) or ''})
    LXX[b][(int(c), int(n))] = ws

# ---------------------------------------------------------------- AT inteiro: contagens e Modelo 1 (hebraico -> grego)
print('lendo AT hebraico...')
ALL = {b: load_oshb(b) for b in OSHB_BOOKS}
count_ot = Counter()
count_book = defaultdict(Counter)
for b, vs in ALL.items():
    for ws in vs.values():
        for w in ws:
            s = main_strong(w['lemma'])
            if s:
                count_ot[s] += 1
                count_book[b][s] += 1

STOP_G = {unicodedata.normalize('NFC', x) for x in ['ὁ','καί','δέ','αὐτός','οὗτος','ἐγώ','σύ','ὅς','γάρ','ὅτι','ἐν','εἰς','ἐπί','πρός','ἐκ','ἀπό','τε','οὖν','μή','οὐ','ἵνα']}
pairs = []
for b, vs in ALL.items():
    lb = LXX_NAME.get(b)
    if not lb or lb not in LXX: continue
    for k, ws in vs.items():
        g = LXX[lb].get(k)
        if not g: continue
        hs = [main_strong(w['lemma']) for w in ws]
        hs = [h for h in hs if h]
        gs = [x['lex'] for x in g if x['lex'] not in STOP_G]
        if hs and gs: pairs.append((hs, gs))
print('pares de versículos:', len(pairs))

t = defaultdict(lambda: 1e-3)
for it in range(6):
    cnt = defaultdict(float); tot = defaultdict(float)
    for hs, gs in pairs:
        for g in gs:
            z = sum(t[(h, g)] for h in hs) + 1e-3
            for h in hs:
                c = t[(h, g)] / z
                cnt[(h, g)] += c; tot[h] += c
    t = defaultdict(float, {k: v / tot[k[0]] for k, v in cnt.items()})
    print('EM', it + 1)

# ---------------------------------------------------------------- versificação portuguesa
vref = open(os.path.join(SRC, 'vref.txt'), encoding='utf-8').read().split('\n')
por = open(os.path.join(SRC, 'por.txt'), encoding='utf-8').read().split('\n')
PT = defaultdict(dict)
for ref, txt in zip(vref, por):
    if not ref.strip() or not txt.strip(): continue
    bk, cv = ref.split(' ')
    c, n = cv.split(':')
    PT[bk][(int(c), int(n))] = txt.strip()

# O corpus segue a versificação portuguesa (Almeida), mas perdeu alguns versículos
# na conversão. Correções conferidas em ebible.org/porbr2018:
PATCH = {('GEN', 31, 55): 'E levantou-se Labão de manhã, beijou seus filhos e suas filhas, e os abençoou; e retrocedeu e voltou a seu lugar.'}
for (bk, c, n), txt in PATCH.items():
    PT[bk][(c, n)] = txt

# mapa versificação portuguesa/KJV -> hebraica (WLC), do VerseMap do morphhb
KJV2WLC = {}
vm = open(os.path.join(SRC, 'morphhb/wlc/VerseMap.xml'), encoding='utf-8').read()
for w, k in re.findall(r'wlc="([^"]+)" kjv="([^"]+)"', vm):
    wb, wc, wn = w.split('.'); kb, kc, kn = k.split('.')
    if not (wn.isdigit() and kn.isdigit() and wc.isdigit() and kc.isdigit()): continue
    KJV2WLC[(kb, int(kc), int(kn))] = (int(wc), int(wn))
os.makedirs(OUT, exist_ok=True)

# ---------------------------------------------------------------- alinhamento hebraico -> grego (guloso)
def align_greek(hw, gw):
    cand = []
    for i, w in enumerate(hw):
        h = main_strong(w['lemma'])
        for j, g in enumerate(gw):
            if g['lex'] in STOP_G: continue
            p = t.get((h, g['lex']), 0.0)
            if p > 0.15: cand.append((p, i, j))
    cand.sort(reverse=True)
    used_i, used_j, align = set(), set(), {}
    for p, i, j in cand:
        if i in used_i or j in used_j: continue
        used_i.add(i); used_j.add(j); align[i] = j
    return align

# ---------------------------------------------------------------- português: Modelo 1 (morfemas hebraicos -> Bíblia Livre)
# Cada palavra hebraica vira morfemas: prefixos (P:b, P:c, P:d...), lema (H7225) e sufixo pronominal (S:3ms).
# O modelo aprende, sobre todo o AT, como a Bíblia Livre verte cada morfema.
import math, pickle, spacy

def src_tokens(w):
    toks = []
    for p in [x.strip() for x in w['lemma'].split('/')]:
        m = re.match(r'(\d+)', p)
        if m: toks.append('H' + m.group(1))
        elif p: toks.append('P:' + p)
    for seg in (w['morph'][1:].split('/') if w['morph'] else []):
        if seg.startswith('Sp'): toks.append('S:' + seg[2:])
    return toks

cache = os.path.join(SRC, 'pt_tokens2.pkl')
if os.path.exists(cache):
    PTTOK = pickle.load(open(cache, 'rb'))
else:
    print('lematizando a Bíblia Livre...')
    nlp = spacy.load('pt_core_news_sm', disable=['parser', 'ner'])
    keys = [(bk, c, n) for bk in PT for (c, n) in PT[bk]]
    PTTOK = {}
    for k, doc in zip(keys, nlp.pipe((PT[k[0]][(k[1], k[2])] for k in keys), batch_size=512)):
        toks = []
        for tk in doc:
            surf = tk.text.strip('-')
            if not re.search(r'\w', surf) or tk.pos_ == 'PUNCT': continue
            lem = surf if tk.pos_ == 'PROPN' else (tk.lemma_ or surf).lower()
            toks.append((surf, lem, tk.pos_, tk.text.startswith('-')))
        PTTOK[k] = toks
    pickle.dump(PTTOK, open(cache, 'wb'))

CODE2B = {v: k for k, v in VREF_NAME.items()}
ppairs = []   # (src_tokens, tgt_lemmas, hw, pttoks, b, hk)
for (bk, c, n), toks in PTTOK.items():
    b = CODE2B.get(bk)
    if not b or not toks: continue
    hk = KJV2WLC.get((b, c, n), (c, n))
    hw = ALL[b].get(hk)
    if not hw: continue
    src = ['NULL'] + [tk for w in hw for tk in src_tokens(w)]
    ppairs.append((src, [x[1] for x in toks], hw, toks, b, hk))
VERBOS_VALIDOS = {x[0].lower() for toks in PTTOK.values() for x in toks}  # infinitivos que existem no texto
print('pares hebraico-português:', len(ppairs))

def modelo1(pares, nome, iters=5):
    tab = None
    for it in range(iters):
        cnt = defaultdict(float); tot = defaultdict(float)
        for src, tgt in pares:
            for e in tgt:
                probs = [1.0] * len(src) if tab is None else [tab.get((x, e), 1e-7) for x in src]
                z = sum(probs)
                for x, pr in zip(src, probs):
                    c = pr / z; cnt[(x, e)] += c; tot[x] += c
        tab = {k: v / tot[k[0]] for k, v in cnt.items() if v / tot[k[0]] > 5e-4}
        del cnt
        print('EM', nome, it + 1, len(tab))
    return tab

# duas direções: P(português | hebraico) e P(hebraico | português); a combinação evita
# que palavras raras (nomes próprios) "absorvam" o versículo inteiro
tp = modelo1([(src, tgt) for src, tgt, *_ in ppairs], 'he->pt')
tr = modelo1([(['NULL'] + tgt, src[1:]) for src, tgt, *_ in ppairs], 'pt->he')

FUNCAO = {'DET', 'ADP', 'CCONJ', 'SCONJ', 'PRON'}
def align_pt(hw, toks):
    """devolve, para cada palavra hebraica, as palavras portuguesas e por qual morfema vieram"""
    src = [(tk, i) for i, w in enumerate(hw) for tk in src_tokens(w)]
    W, J = len(hw), len(toks)
    a = [None] * J
    for j, (surf, lem, pos, encl) in enumerate(toks):
        best, bp, btk = -1, 0.004, None
        for tk, i in src:
            pr = math.sqrt(tp.get((tk, lem), 0) * tr.get((lem, tk), 0)) * math.exp(-4.0 * abs((i + .5) / W - (j + .5) / J))
            if pr > bp: bp, best, btk = pr, i, tk
        if best >= 0: a[j] = (best, btk)
    # artigos, preposições, conjunções e pronomes ligados só a prefixo/sufixo (ou a nada)
    # acompanham a palavra de conteúdo vizinha: antes dela (proclíticos) ou depois (enclíticos "-o", "-lhe")
    for j, (surf, lem, pos, encl) in enumerate(toks):
        if pos not in FUNCAO: continue
        if a[j] and a[j][1].startswith('H'): continue
        rng = range(j - 1, -1, -1) if encl else range(j + 1, J)
        for k in rng:
            if toks[k][2] not in FUNCAO and a[k]:
                a[j] = (a[k][0], 'F'); break
    out = [[] for _ in hw]
    for j, (surf, lem, pos, encl) in enumerate(toks):
        if a[j]: out[a[j][0]].append((j, surf, lem, pos, a[j][1]))
    return out

# classe da palavra hebraica -> classes portuguesas aceitas como tradução
COMPAT = {'N': {'NOUN', 'PROPN', 'ADJ'}, 'V': {'VERB', 'AUX'}, 'A': {'ADJ', 'NOUN', 'NUM'}, 'D': {'ADV'}}
def classe_heb(morph):
    segs = morph[1:].split('/') if morph else []
    for seg in segs:  # a classe do lema é a do segmento que não é prefixo nem sufixo
        if seg[:1] in 'NVAD' and not seg.startswith('Td'): return seg[:1]
    return None
def lema_valido(lem, pos):
    if pos in ('VERB', 'AUX'): return bool(re.search(r'(ar|er|ir|or|ôr)$', lem)) and lem in VERBOS_VALIDOS
    return len(lem) > 1
MEAN_H = defaultdict(Counter)
MEAN_G = defaultdict(Counter)
for src, tgt, hw, toks, b, hk in ppairs:
    al = align_pt(hw, toks)
    lb = LXX_NAME.get(b)
    gw = LXX.get(lb, {}).get(hk, []) if lb else []
    ag = align_greek(hw, gw) if gw else {}
    for i, lst in enumerate(al):
        h = main_strong(hw[i]['lemma'])
        cl = classe_heb(hw[i]['morph'])
        if not cl: continue
        for j, surf, lem, pos, btk in lst:
            if btk != h or pos not in COMPAT[cl] or not lema_valido(lem, pos): continue
            MEAN_H[h][lem] += 1
            if i in ag:
                g = gw[ag[i]]
                MEAN_G[g['s'] or ('L:' + g['lex'])][lem] += 1

def traducoes(counter):
    tot = sum(counter.values())
    if not tot: return []
    return [w for w, c in counter.most_common(10) if c >= 3 and c / tot >= 0.03][:6]

# ---------------------------------------------------------------- saída por livro
for b in WANT:
    vs = ALL[b]; lb = LXX_NAME.get(b); code = VREF_NAME[b]
    lex_h, lex_g = {}, {}
    verses = {}
    for (c, n), txt in sorted(PT[code].items()):
        hk = KJV2WLC.get((b, c, n), (c, n))
        hw = vs.get(hk, [])
        gw = LXX.get(lb, {}).get(hk, []) if lb else []
        align = align_greek(hw, gw)
        toks_v = PTTOK.get((code, c, n), [])
        ptal = align_pt(hw, toks_v) if hw else []
        rows = []
        for i, w in enumerate(hw):
            h = main_strong(w['lemma'])
            r = root_of(h) if h else None
            for x in (h, r):
                if x and x in HEB and x not in lex_h:
                    e = HEB[x]
                    lex_h[x] = [e.get('lemma',''), e.get('xlit',''), e.get('strongs_def',''), e.get('kjv_def',''), traducoes(MEAN_H[x])]
            rows.append([w['t'].replace('/', ''), translit(w['t']), h or '', r or '', heb_morph(w['morph']),
                         count_book[b].get(h, 0), count_ot.get(h, 0), align.get(i, -1),
                         ' '.join(('-' if toks_v[x[0]][3] else '') + x[1] for x in sorted(ptal[i])).replace(' -', '-')])
        g_rows = []
        for g in gw:
            s = g['s']
            k = s or ('L:' + g['lex'])
            if k not in lex_g:
                e = GRK.get(s, {})
                lex_g[k] = [e.get('lemma', g['lex']), e.get('translit',''), e.get('strongs_def',''), e.get('kjv_def',''), traducoes(MEAN_G[k])]
            g_rows.append([g['g'], g['tr'], g['lex'], s, greek_morph(g['m'])])
        verses[f'{c}:{n}'] = {'pt': txt, 'he': rows, 'gr': g_rows}
        if hk != (c, n):
            verses[f'{c}:{n}']['heb_ref'] = f'{hk[0]}:{hk[1]}'
    caps = defaultdict(int)
    for (c, n) in PT[code]:
        caps[c] = max(caps[c], n)
    data = {'livro': b, 'capitulos': [caps[c] for c in sorted(caps)], 'abrev': APP_ABBR.get(b, b), 'versiculos': verses, 'lex_he': lex_h, 'lex_gr': lex_g,
            'colunas_he': ['texto','translit','strong','raiz','morfologia','ocorr_livro','ocorr_at','lxx_idx','pt_auto'],
            'colunas_gr': ['texto','translit','lema','strong','morfologia']}
    path = os.path.join(OUT, APP_ABBR.get(b, b).lower() + '.json')
    json.dump(data, open(path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('ok', path, os.path.getsize(path) // 1024, 'KB', len(verses), 'versículos')
