// Script to add new expressions to akari.vtube.json
import fs from 'fs';
import crypto from 'crypto';

const vtubeJsonPath = 'd:/SteamLibrary/steamapps/common/VTube Studio/VTube Studio_Data/StreamingAssets/Live2DModels/akari_vts/akari.vtube.json';

// Expressions to add (from shuangsheng)
const newExpressions = [
  'aixin.exp3.json',
  'baisi.exp3.json',
  'baowawa.exp3.json',
  'changge.exp3.json',
  'heilian.exp3.json',
  'huanzhuang.exp3.json',
  'jiyan.exp3.json',
  'lianhong.exp3.json',
  'tousi.exp3.json',
  'waitao.exp3.json',
  'yanlei.exp3.json',
  'yun.exp3.json'
];

// Read existing vtube.json
const vtubeJson = JSON.parse(fs.readFileSync(vtubeJsonPath, 'utf8'));

// Get existing expression files
const existingFiles = new Set();
if (vtubeJson.Hotkeys) {
  vtubeJson.Hotkeys.forEach(hotkey => {
    if (hotkey.Action === 'ToggleExpression' && hotkey.File) {
      existingFiles.add(hotkey.File);
    }
  });
}

// Template for new hotkey entry
function createHotkeyEntry(fileName) {
  const hotkeyId = crypto.randomUUID();
  const name = fileName.replace('.exp3.json', '');
  
  return {
    "HotkeyID": hotkeyId,
    "Name": name,
    "Action": "ToggleExpression",
    "File": fileName,
    "Folder": "",
    "AutoCreated": false,
    "Position": {
      "X": 0.0,
      "Y": 0.0,
      "Z": 0.0,
      "Rotation": 0.0
    },
    "ColorOverlay": {
      "On": false,
      "IsStaticColor": false,
      "Display": -1,
      "WindowName": "",
      "IncludeLeft": false,
      "IncludeMid": false,
      "IncludeRight": false,
      "BaseValue": 0,
      "OverlayValue": 0,
      "Smoothing": 0,
      "IncludeItems": false,
      "StaticColor": {
        "r": 0.0,
        "g": 0.0,
        "b": 0.0,
        "a": 1.0
      }
    },
    "ColorScreenMultiplyPreset": {
      "ArtMeshMultiplyAndScreenColors": []
    },
    "HandGestureSettings": {
      "GestureLeft": "",
      "GestureRight": "",
      "GestureCombinator": "AND",
      "AllowMirroredGesture": false,
      "DeactivateExpWhenGestureNotDetected": false,
      "SecondsUntilDetection": 0.5,
      "SecondsDetected": 0.0,
      "PercentDetected": 0.0
    },
    "LoadModelSettings": {
      "LoadAtCurrentPosition": true
    },
    "TwitchTriggers": {
      "Active": false,
      "CooldownActive": false,
      "CooldownSeconds": 30.0,
      "ResetActive": false,
      "HideModelResetDialog": false,
      "Active_GiftSubTrigger": false,
      "Active_BitTrigger": false,
      "Active_RedeemTrigger": false,
      "Active_TextCommandTrigger": false,
      "Active_SubTrigger": false,
      "Active_FollowTrigger": false,
      "Active_RaidTrigger": false,
      "Active_ShoutoutTrigger": false,
      "Active_AdbreakTrigger": false,
      "Trigger_TextCommandTrigger": "",
      "Trigger_Redeem_Name": "",
      "Trigger_Redeem_ID": "",
      "UseTextTriggerUserTypeRestriction": false,
      "RestrictTextTriggerTo": {
        "Allowed_You": true,
        "Allowed_Subs": false,
        "Allowed_Mods": false,
        "Allowed_VIPs": false,
        "Allowed_Artists": false,
        "Allowed_UserNames": false,
        "UserNames": [],
        "Allowed_UserIDs": false,
        "UserIDs": []
      },
      "AllowRepeatedFollow": false,
      "AllowRepeatedRaid": false,
      "AllowRepeatedShoutout": false,
      "AllowRepeatedAdbreak": false
    },
    "YouTubeTriggers": {
      "Active": false,
      "CooldownActive": false,
      "CooldownSeconds": 30.0,
      "ResetActive": false,
      "HideModelResetDialog": false,
      "Active_MemberMilestoneTrigger": false,
      "Active_SuperChatTrigger": false,
      "Active_SuperStickerTrigger": false,
      "Active_MembershipGiftTrigger": false,
      "Active_MembershipMilestoneTrigger": false,
      "Active_NewMemberTrigger": false,
      "Active_SubscriberTrigger": false,
      "Active_SponsorTrigger": false,
      "Trigger_SuperChat_Amount": 0.0,
      "Trigger_SuperSticker_Amount": 0.0,
      "Trigger_MembershipGift_Amount": 0,
      "Trigger_MembershipMilestone_Months": 0,
      "Trigger_NewMember_Months": 0,
      "Trigger_Subscriber_Months": 0,
      "Trigger_Sponsor_Months": 0,
      "UseAmountTriggerUserTypeRestriction": false,
      "RestrictAmountTriggerTo": {
        "Allowed_You": true,
        "Allowed_Subs": false,
        "Allowed_Mods": false,
        "Allowed_VIPs": false,
        "Allowed_Artists": false,
        "Allowed_UserNames": false,
        "UserNames": [],
        "Allowed_UserIDs": false,
        "UserIDs": []
      }
    }
  };
}

// Add new expressions
let addedCount = 0;
newExpressions.forEach(fileName => {
  if (!existingFiles.has(fileName)) {
    const newEntry = createHotkeyEntry(fileName);
    vtubeJson.Hotkeys.push(newEntry);
    existingFiles.add(fileName);
    addedCount++;
    console.log(`Added: ${fileName}`);
  } else {
    console.log(`Skipped (already exists): ${fileName}`);
  }
});

// Write back to file
fs.writeFileSync(vtubeJsonPath, JSON.stringify(vtubeJson, null, 4), 'utf8');

console.log(`\nDone! Added ${addedCount} new expressions to akari.vtube.json`);





