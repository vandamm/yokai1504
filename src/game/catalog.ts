import type { CardDefinition, CardDefId } from './types';

// Transcribed from the designer's bilingual illustrations; provenance: docs/references/yokai-1504-card-catalog.md.
const definitions: CardDefinition[] = [
  {id:'karakasa-kozo',name:'Karakasa-kozo',japanese:'唐傘小僧',kind:'yokai',atk:1,cap:3,effectType:'release',text:'Release 1 soul: destroy any 1 set spell trap.'},
  {id:'kappa',name:'Kappa',japanese:'河童',kind:'yokai',atk:2,cap:3,effectType:'possession',text:'This yokai gains an additional +1 ATK for each soul on it.'},
  {id:'nekomata',name:'Nekomata',japanese:'猫又',kind:'yokai',atk:3,cap:3,effectType:'release',text:"Release 1 soul: switch control of this yokai with an opponent's yokai."},
  {id:'zashiki-warashi',name:'Zashiki-warashi',japanese:'座敷童子',kind:'yokai',atk:2,cap:2,effectType:'possession',text:'This yokai and any souls on it are unaffected by all spells.'},
  {id:'chochin-kozo',name:'Chochin-kozo',japanese:'提灯小僧',kind:'yokai',atk:2,cap:2,effectType:'possession',text:'At the end of the Battle Phase, destroy any yokai that battled this card.'},
  {id:'rokurokubi',name:'Rokurokubi',japanese:'轆轤首',kind:'yokai',atk:3,cap:3,effectType:'possession',text:'When this yokai destroys a yokai in battle, draw 1 card.'},
  {id:'yuki-onna',name:'Yuki-onna',japanese:'雪女',kind:'yokai',atk:3,cap:2,effectType:'passive',text:'If this yokai would be defeated in battle, remove 1 soul from it instead.'},
  {id:'tengu',name:'Tengu',japanese:'天狗',kind:'yokai',atk:4,cap:3,effectType:'passive',text:'At the start of each of your Main Phases, take 1 damage.'},
  {id:'nurikabe',name:'Nurikabe',japanese:'塗壁',kind:'yokai',atk:5,cap:1,effectType:'passive',text:'Your yokai cannot attack during the turn that this yokai is summoned.'},
  {id:'sake',name:'Sake',japanese:'酒',kind:'spell',atk:0,cap:0,effectType:'spell',text:'Distribute up to 3 souls between yokai on the field.'},
  {id:'kozuchi',name:'Kozuchi',japanese:'小槌',kind:'spell',atk:0,cap:0,effectType:'spell',text:'Draw 2 cards.'},
  {id:'jufu',name:'Jufu',japanese:'呪符',kind:'spell',atk:0,cap:0,effectType:'spell',text:'Destroy up to 2 yokai with souls on them.'},
  {id:'boseki',name:'Boseki',japanese:'墓石',kind:'spell',atk:0,cap:0,effectType:'spell',text:'Choose 1 yokai from either graveyard and summon it to your field.'},
  {id:'ougi',name:'Ougi',japanese:'扇',kind:'spell',atk:0,cap:0,effectType:'spell',text:'Move 1 soul from a yokai on the field to another yokai on the field.'},
  {id:'hamaya',name:'Hamaya',japanese:'破魔矢',kind:'spell',atk:0,cap:0,effectType:'spell',text:'Destroy one of the highest ATK yokai on the field.'},
];
export const CARDS = Object.fromEntries(definitions.map(card => [card.id, card])) as Record<CardDefId, CardDefinition>;
export const DECK: CardDefId[] = definitions.map(card => card.id);
