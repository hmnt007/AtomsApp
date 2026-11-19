const fs = require('fs');
const path = require('path');
const { withDangerousMod, withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');

const BACKUP_RULES_XML = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
    <cloud-backup>
        <include domain="sharedpref" path="." />
        <include domain="database" path="." />
        <include domain="file" path="." />
    </cloud-backup>
    <device-transfer>
        <include domain="sharedpref" path="." />
        <include domain="database" path="." />
        <include domain="file" path="." />
    </device-transfer>
</data-extraction-rules>
`;

function withBackupRulesXml(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const xmlDir = path.join(config.modRequest.platformProjectRoot, 'app/src/main/res/xml');
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(path.join(xmlDir, 'backup_rules.xml'), BACKUP_RULES_XML);
      return config;
    },
  ]);
}

function withBackupManifestAttributes(config) {
  return withAndroidManifest(config, (config) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    application.$['android:allowBackup'] = 'true';
    application.$['android:dataExtractionRules'] = '@xml/backup_rules';
    application.$['android:fullBackupContent'] = 'true';
    return config;
  });
}

function withAndroidBackupRules(config) {
  config = withBackupRulesXml(config);
  config = withBackupManifestAttributes(config);
  return config;
}

module.exports = withAndroidBackupRules;
