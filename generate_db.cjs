const fs = require('fs');

const disasters = [
  'Flood', 'Beach Drowning', 'Boat Accident', 'Tree Fall', 'Fire Accident',
  'Cyclone', 'Building Collapse', 'Coastal Flooding', 'Earthquake', 'Landslide'
];

const coreIntents = [
  {
    intent: 'time_eta',
    baseResponse: "We have dispatched a team to your location. ETA is approximately 15 minutes. Stay safe.",
    variations: [
      "how long will it take", "when are you coming", "what is the eta", "where are you",
      "are you on the way", "how much time", "i need help now how long", "hurry up when",
      "what time will you reach", "is anyone coming"
    ]
  },
  {
    intent: 'fear_panic',
    baseResponse: "Please stay calm. Panic exhausts your energy. Take deep breaths; we are tracking your GPS location.",
    variations: [
      "i am scared", "i am terrified", "im panicking", "help me im afraid",
      "what do i do im scared", "im alone and scared", "please help me im terrified",
      "i don't know what to do im panicking", "calm me down", "im freaking out"
    ]
  },
  {
    intent: 'medical_bleeding',
    baseResponse: "Apply direct, firm pressure to the wound with a clean cloth. Elevate the injured area if possible.",
    variations: [
      "i am bleeding", "there is blood", "i cut myself", "im losing blood",
      "how to stop bleeding", "deep cut what to do", "blood won't stop",
      "someone is bleeding", "i have a gash", "bleeding heavily"
    ]
  },
  {
    intent: 'medical_broken_bone',
    baseResponse: "Do not move the injured area. Keep it immobilized. Do not try to realign the bone.",
    variations: [
      "i broke a bone", "my leg is broken", "fractured arm", "i think my bone is broken",
      "it hurts to move my leg", "broken arm what to do", "snapped my bone",
      "fracture first aid", "can't move my limb", "crushed my leg"
    ]
  },
  {
    intent: 'trapped_general',
    baseResponse: "Do not exhaust yourself shouting. Tap rhythmically 3 times on a solid object so our sonar can detect you.",
    variations: [
      "i am trapped", "i am stuck", "can't get out", "im trapped under here",
      "blocked exit", "rubble is blocking me", "im wedged in",
      "how to get out if trapped", "im stuck in a room", "door won't open trapped"
    ]
  },
  {
    intent: 'water_food',
    baseResponse: "Conserve whatever clean bottled water you have. Do NOT drink flood or unknown water. Humans can survive long without food; prioritize hydration.",
    variations: [
      "im thirsty", "need water", "can i drink this water", "im hungry",
      "we have no food", "running out of water", "should i drink flood water",
      "starving what to do", "dehydrated", "need drinking water"
    ]
  },
  {
    intent: 'battery_power',
    baseResponse: "Dim your screen brightness and turn on power-saving mode. Only use your phone for emergency communication.",
    variations: [
      "my battery is low", "phone dying", "no power", "battery about to die",
      "how to save battery", "running out of charge", "phone at 5 percent",
      "blackout no power to charge", "need to save phone battery", "phone switching off soon"
    ]
  }
];

const disasterSpecifics = {
  'Flood': [
    {
      baseResponse: "Move to the highest possible floor or the roof. Do NOT enter closed attics where you can be trapped by rising water.",
      variations: ["water is rising", "flood water entering house", "house is flooding", "where to go in flood", "water level increasing", "my room is filling with water", "flood rising fast", "should i go to the attic", "water up to my knees", "safe place from flood"]
    },
    {
      baseResponse: "Do not walk or swim through moving floodwaters. Just 6 inches of moving water can knock you down.",
      variations: ["can i swim out", "should i walk through the flood", "moving water", "crossing flood water", "is it safe to swim", "water current is strong", "walking in flood", "wading through water", "how deep is safe", "current pulling me"]
    },
    {
      baseResponse: "Turn off the main power switch if it is safe to do so. Water and electricity are extremely dangerous.",
      variations: ["electric shock risk", "water touching sockets", "should i turn off power", "sparks in water", "flooded switchboard", "electrocution fear", "power still on in flood", "appliances in water", "water near wires", "turn off electricity"]
    }
  ],
  'Earthquake': [
    {
      baseResponse: "Drop to your hands and knees. Cover your head and neck. Hold on to your shelter until the shaking stops.",
      variations: ["ground is shaking", "earthquake what to do", "everything is shaking", "tremors happening", "how to survive earthquake", "should i run outside", "shaking won't stop", "drop cover hold on", "aftershocks", "room is vibrating"]
    },
    {
      baseResponse: "If you are trapped under debris, cover your mouth with clothing. Tap on a pipe or wall so rescuers can locate you.",
      variations: ["trapped under rubble", "building fell on me", "stuck under concrete", "can't breathe dust", "buried in earthquake", "roof collapsed on me", "crushed by wall", "how to signal under rubble", "trapped in dark", "earthquake debris"]
    },
    {
      baseResponse: "Do not use elevators. If you are in bed, stay there and cover your head with a pillow.",
      variations: ["should i use the elevator", "im in bed earthquake", "running down stairs", "escaping tall building", "elevator safe", "sleeping during earthquake", "stairs are broken", "how to evacuate building", "bed shaking", "high rise earthquake"]
    }
  ],
  'Fire Accident': [
    {
      baseResponse: "Stay low to the ground where the air is cleaner. Cover your nose and mouth with a damp cloth if possible.",
      variations: ["too much smoke", "can't breathe smoke", "fire smoke inhalation", "room filled with smoke", "choking on smoke", "how to crawl in fire", "protect from smoke", "smoke everywhere", "thick black smoke", "lungs hurting smoke"]
    },
    {
      baseResponse: "Before opening any door, feel the doorknob. If it's hot, the fire is on the other side. Find another way out.",
      variations: ["should i open the door", "door is hot", "fire outside room", "trapped by fire", "how to escape fire", "fire in hallway", "doorknob hot", "can't exit room", "blocked by flames", "checking for fire"]
    },
    {
      baseResponse: "If your clothes catch fire: STOP, DROP to the ground, and ROLL over and over to smother the flames.",
      variations: ["my clothes are on fire", "im burning", "fire on me", "stop drop and roll", "caught fire", "burning alive", "how to put out fire on clothes", "flames on my shirt", "extinguish self", "body on fire"]
    }
  ],
  'Cyclone': [
    {
      baseResponse: "Stay indoors, away from windows and glass doors. Close all interior doors and secure external doors.",
      variations: ["wind is howling", "windows breaking", "cyclone outside", "staying safe in cyclone", "storm winds", "glass shattering", "where to hide in cyclone", "wind destroying house", "hurricane winds", "flying debris"]
    },
    {
      baseResponse: "Do not be fooled by the calm eye of the storm. The winds will return rapidly from the opposite direction.",
      variations: ["storm stopped", "wind died down", "is the cyclone over", "eye of the storm", "can i go outside now", "calm weather sudden", "storm pause", "cyclone eye", "safe to leave house", "temporary calm"]
    },
    {
      baseResponse: "Turn off the main gas valve and electricity. Have your emergency kit ready in a waterproof bag.",
      variations: ["power lines down", "gas leak cyclone", "prepare for cyclone", "cyclone kit", "turn off gas", "electric wires snapping", "what to pack", "storm preparation", "secure house", "wind blowing roof"]
    }
  ],
  // Add simplified entries for the rest to ensure we hit 1000 total via combinations
  'Beach Drowning': [{ baseResponse: "Float on your back to conserve energy. Do not fight a rip current; swim parallel to the shore.", variations: ["rip current", "pulled out to sea", "can't swim back", "drowning", "swallowed water", "floating", "tired swimming", "swept away", "ocean current", "waves too big"] }, { baseResponse: "Signal for help by raising one arm while floating.", variations: ["how to ask for help in water", "nobody sees me", "lifeguard", "raising arm", "shouting in water", "swimming rescue", "help me drowning", "sinking", "going under", "need rescue boat"] }, { baseResponse: "If someone else is drowning, throw them a flotation device. Do not jump in unless trained.", variations: ["friend drowning", "someone is drowning", "how to save drowning person", "throw rope", "rescue tube", "jumping in to save", "drowning victim", "saving someone", "helping swimmer", "flotation ring"] }],
  'Boat Accident': [{ baseResponse: "Put on your life jacket immediately. Stay with the boat if it is still afloat.", variations: ["boat sinking", "capsized", "life jacket", "boat flipping", "water in boat", "abandon ship", "stay with boat", "sinking vessel", "taking on water", "boat crash"] }, { baseResponse: "If in cold water, assume the HELP position (knees to chest) to retain body heat.", variations: ["freezing water", "cold water survival", "hypothermia", "freezing cold", "huddling in water", "help position", "surviving cold sea", "icy water", "body going numb", "cold shock"] }, { baseResponse: "Use flares, whistles, or mirrors to signal other vessels or aircraft.", variations: ["flare gun", "how to signal boat", "whistle", "mirror signal", "lost at sea", "stranded on boat", "calling mayday", "radio broken", "no signal", "flare emergency"] }],
  'Tree Fall': [{ baseResponse: "Move away from the fallen tree immediately. There may be live power lines entangled in the branches.", variations: ["tree fell on house", "tree blocking road", "power lines in tree", "fallen branches", "crushed by tree", "huge tree fell", "wires and branches", "live wire tree", "tree struck car", "tree collapsed"] }, { baseResponse: "Do not attempt to move the tree yourself. Wait for professional rescue teams with chainsaws.", variations: ["how to lift tree", "moving branches", "chainsaw", "cutting tree", "trapped under branch", "tree too heavy", "clearing road", "blocked path", "tree fell on me", "lifting log"] }, { baseResponse: "If you are inside a vehicle crushed by a tree, stay inside unless there is immediate danger of fire.", variations: ["tree fell on car", "trapped in car tree", "car crushed", "windshield smashed tree", "can't exit car", "stay in car", "tree hit roof", "trapped inside vehicle", "car accident tree", "driving tree fell"] }],
  'Building Collapse': [{ baseResponse: "Stay near load-bearing walls or under sturdy furniture. Protect your head.", variations: ["building falling", "roof caved in", "structural collapse", "ceiling dropping", "falling concrete", "hiding under desk", "load bearing wall", "pancake collapse", "building crumbling", "pillars breaking"] }, { baseResponse: "Do not light matches or lighters. There may be leaking gas.", variations: ["smell gas", "lighting match", "using lighter in dark", "gas explosion risk", "dark rubble", "leaking pipes", "gas main broken", "fire risk collapse", "flammable gas", "spark explosion"] }, { baseResponse: "Cover your mouth with a cloth to avoid inhaling toxic dust.", variations: ["dust everywhere", "concrete dust", "can't breathe rubble", "asbestos", "toxic air", "choking on dust", "covering mouth", "dust cloud", "breathing debris", "dirty air"] }],
  'Coastal Flooding': [{ baseResponse: "Evacuate immediately to higher ground inland. Do not wait for the water to reach you.", variations: ["tsunami warning", "sea level rising", "waves crashing street", "ocean flooding", "storm surge", "coastal evacuation", "water entering town", "running from waves", "high tide flood", "sea wall broken"] }, { baseResponse: "Beware of reverse currents pulling debris and vehicles out to sea.", variations: ["water pulling back", "debris in water", "cars floating", "ocean current strong", "sucked into sea", "undertow", "retreating water", "floating away", "swept to sea", "flood current"] }, { baseResponse: "Do not return to coastal areas until authorities give the all-clear signal.", variations: ["can i go back", "returning home", "is tsunami over", "all clear", "safe to return", "coastal safe", "checking house", "water receded", "going back to beach", "warning lifted"] }],
  'Landslide': [{ baseResponse: "Move away from the path of the landslide as quickly as possible. Run to higher ground off the path.", variations: ["mud sliding", "rocks falling", "hill collapsing", "mudslide", "landslide coming", "ground moving", "running from mud", "escaping rocks", "mountain falling", "debris flow"] }, { baseResponse: "If escape is not possible, curl into a tight ball and protect your head.", variations: ["trapped by mud", "can't outrun landslide", "mud covering me", "protecting head", "curling up", "buried in mud", "rocks hitting me", "stuck in mudslide", "overtaken by debris", "survival position"] }, { baseResponse: "Listen for unusual sounds like trees cracking or boulders knocking together, which indicate moving debris.", variations: ["rumbling sound", "trees snapping", "rocks crashing", "warning signs landslide", "hearing rocks", "loud roar mountain", "ground shaking", "moving earth", "cracking noise", "boulders falling"] }]
};

const database = {};

disasters.forEach(disaster => {
  database[disaster] = [];
  
  // Add the 7 core intents (70 variations)
  coreIntents.forEach(intent => {
    intent.variations.forEach(variation => {
      database[disaster].push({
        question: variation,
        answer: intent.baseResponse
      });
    });
  });

  // Add the 3 specific intents (30 variations)
  const specifics = disasterSpecifics[disaster];
  if (specifics) {
    specifics.forEach(spec => {
      spec.variations.forEach(variation => {
        database[disaster].push({
          question: variation,
          answer: spec.baseResponse
        });
      });
    });
  }
});

// Write to file
fs.writeFileSync('./src/services/offlineChatDb.json', JSON.stringify(database, null, 2));
console.log('Successfully generated 1000 QA pairs across 10 disasters!');
