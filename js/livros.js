// Livros do Antigo Testamento na ordem e divisão da Bíblia Hebraica (Tanakh).
// "ativo": livros já disponíveis para exegese nesta etapa.
window.CANON = [
  {
    id: 'tora', nome: 'Torá', hebraico: 'תּוֹרָה', subtitulo: 'A Lei · Pentateuco', cor: 'tora',
    grupos: [{ livros: [
      { abrev: 'Gn', nome: 'Gênesis', heb: 'בְּרֵאשִׁית', arquivo: 'gn', ativo: true },
      { abrev: 'Êx', nome: 'Êxodo', heb: 'שְׁמוֹת' },
      { abrev: 'Lv', nome: 'Levítico', heb: 'וַיִּקְרָא' },
      { abrev: 'Nm', nome: 'Números', heb: 'בְּמִדְבַּר' },
      { abrev: 'Dt', nome: 'Deuteronômio', heb: 'דְּבָרִים' }
    ]}]
  },
  {
    id: 'neviim', nome: 'Nevi’im', hebraico: 'נְבִיאִים', subtitulo: 'Os Profetas', cor: 'neviim',
    grupos: [
      { titulo: 'Profetas Anteriores', livros: [
        { abrev: 'Js', nome: 'Josué', heb: 'יְהוֹשֻׁעַ' },
        { abrev: 'Jz', nome: 'Juízes', heb: 'שׁוֹפְטִים' },
        { abrev: '1Sm', nome: '1 Samuel', heb: 'שְׁמוּאֵל א' },
        { abrev: '2Sm', nome: '2 Samuel', heb: 'שְׁמוּאֵל ב' },
        { abrev: '1Rs', nome: '1 Reis', heb: 'מְלָכִים א' },
        { abrev: '2Rs', nome: '2 Reis', heb: 'מְלָכִים ב' }
      ]},
      { titulo: 'Profetas Posteriores', livros: [
        { abrev: 'Is', nome: 'Isaías', heb: 'יְשַׁעְיָהוּ' },
        { abrev: 'Jr', nome: 'Jeremias', heb: 'יִרְמְיָהוּ' },
        { abrev: 'Ez', nome: 'Ezequiel', heb: 'יְחֶזְקֵאל' }
      ]},
      { titulo: 'Os Doze', livros: [
        { abrev: 'Os', nome: 'Oseias', heb: 'הוֹשֵׁעַ' },
        { abrev: 'Jl', nome: 'Joel', heb: 'יוֹאֵל' },
        { abrev: 'Am', nome: 'Amós', heb: 'עָמוֹס' },
        { abrev: 'Ob', nome: 'Obadias', heb: 'עֹבַדְיָה' },
        { abrev: 'Jn', nome: 'Jonas', heb: 'יוֹנָה' },
        { abrev: 'Mq', nome: 'Miqueias', heb: 'מִיכָה' },
        { abrev: 'Na', nome: 'Naum', heb: 'נַחוּם' },
        { abrev: 'Hc', nome: 'Habacuque', heb: 'חֲבַקּוּק' },
        { abrev: 'Sf', nome: 'Sofonias', heb: 'צְפַנְיָה' },
        { abrev: 'Ag', nome: 'Ageu', heb: 'חַגַּי' },
        { abrev: 'Zc', nome: 'Zacarias', heb: 'זְכַרְיָה' },
        { abrev: 'Ml', nome: 'Malaquias', heb: 'מַלְאָכִי' }
      ]}
    ]
  },
  {
    id: 'ketuvim', nome: 'Ketuvim', hebraico: 'כְּתוּבִים', subtitulo: 'Os Escritos', cor: 'ketuvim',
    grupos: [
      { titulo: 'Livros poéticos', livros: [
        { abrev: 'Sl', nome: 'Salmos', heb: 'תְּהִלִּים' },
        { abrev: 'Pv', nome: 'Provérbios', heb: 'מִשְׁלֵי' },
        { abrev: 'Jó', nome: 'Jó', heb: 'אִיּוֹב' }
      ]},
      { titulo: 'Cinco Rolos (Megillot)', livros: [
        { abrev: 'Ct', nome: 'Cântico dos Cânticos', heb: 'שִׁיר הַשִּׁירִים' },
        { abrev: 'Rt', nome: 'Rute', heb: 'רוּת' },
        { abrev: 'Lm', nome: 'Lamentações', heb: 'אֵיכָה' },
        { abrev: 'Ec', nome: 'Eclesiastes', heb: 'קֹהֶלֶת' },
        { abrev: 'Et', nome: 'Ester', heb: 'אֶסְתֵּר' }
      ]},
      { titulo: 'Demais Escritos', livros: [
        { abrev: 'Dn', nome: 'Daniel', heb: 'דָּנִיֵּאל' },
        { abrev: 'Ed', nome: 'Esdras', heb: 'עֶזְרָא' },
        { abrev: 'Ne', nome: 'Neemias', heb: 'נְחֶמְיָה' },
        { abrev: '1Cr', nome: '1 Crônicas', heb: 'דִּבְרֵי הַיָּמִים א' },
        { abrev: '2Cr', nome: '2 Crônicas', heb: 'דִּבְרֵי הַיָּמִים ב' }
      ]}
    ]
  }
];
