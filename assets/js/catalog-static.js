// Existing Stitch reference only. No amount or currency is commercially approved.
const categories = [
  ['wellness','Bienestar','Wellness'], ['dining','Gastronomía privada','Private Dining'],
  ['water','Aventuras acuáticas','Water Adventures'], ['land','Aventuras terrestres','Land Adventures'],
  ['nature','Naturaleza y vida silvestre','Nature & Wildlife'],
].map(([id,es,en]) => ({id,slug:id,translations:{es:{name:es},en:{name:en}}}));

export const staticReferenceCatalog = {
  schemaVersion: 1,
  source: 'static_reference',
  categories,
  services: [
    {
      id:'yoga', revisionId:'reference-yoga-v1', slug:'yoga', categoryId:'wellness', source:'stitch_reference',
      translations:{
        en:{title:'Private Sunset Yoga',description:'A rejuvenating private session tailored to your skill level, guided by a local expert instructor.'},
        es:{title:'Yoga privado al atardecer',description:'Una sesión privada adaptada a tu nivel, guiada por un instructor local.'},
      },
      options:[{id:'yoga-default',translations:{es:{name:'Yoga privado al atardecer'},en:{name:'Private Sunset Yoga'}},durationMinutes:90,experienceType:'private',venue:'in_property',price:null}],
      media:[{id:'reference-yoga-image',url:'assets/images/marketplace/yoga.jpg',sortOrder:0,alt:{es:'Ilustración de la referencia de Stitch: Yoga privado al atardecer',en:'Illustration from the Stitch reference: Private Sunset Yoga'}}],
      referencePrice:{amount:'120',symbol:'$',currency:null,unit:'person'},
    },
    {
      id:'chef', revisionId:'reference-chef-v1', slug:'chef', categoryId:'dining', source:'stitch_reference',
      translations:{
        en:{title:'Gourmet Private Chef',description:'An exquisite culinary journey prepared in your villa’s kitchen, featuring local organic ingredients and tailored menus.'},
        es:{title:'Chef privado gourmet',description:'Una experiencia culinaria preparada en tu villa, con ingredientes orgánicos locales y menús personalizados.'},
      },
      options:[{id:'chef-default',translations:{es:{name:'Chef privado gourmet'},en:{name:'Gourmet Private Chef'}},durationMinutes:180,experienceType:'private',venue:'in_property',price:null}],
      media:[{id:'reference-chef-image',url:'assets/images/marketplace/chef.jpg',sortOrder:0,alt:{es:'Ilustración de la referencia de Stitch: Chef privado gourmet',en:'Illustration from the Stitch reference: Gourmet Private Chef'}}],
      referencePrice:{amount:'350',symbol:'$',currency:null,unit:'dinner'},
    },
  ],
};
