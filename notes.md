No, the class name doesn't matter. AllMyCoreEntityHooks is picked up exactly like JddoesdevCoreEntityHooks. The [ModuleName][Type]Hooks pattern is just core's naming convention (NodeHooks, NodeThemeHooks, UserHooks).

Discovery is done by HookCollectorPass (web/core/lib/Drupal/Core/Hook/HookCollectorPass.php). It finds hoosses by directory, not by name:
The file must be under the module's sr at :597 only accepts .php files belowsrc/Hook/. Subdirectories work too.
The class name is built from the file MyCoreEntityHooks.php it looks forDrupal\jddoesdev_core\Hook\AllMyCoreEntityHooks. So the file name has to match the class name, and the namespace has to match the folder (stac/Hook/Entity/AllMyCoreEntityHooks.php must be in the Drupal\jddoesdev_core\Hook\Entity namespace. If they don't match, the class_exists() check fails and the class is skipped with no error
It needs at least one #[Hook] attribute, on a method or on the class itself. A class with no attributes is ignored.

Any class that passes those three checks is registered as an autowired service (:379). The module that owns each hook is the module whose folder the file is in, unless you override it with #[Hook('...', module: 'other')]. The class name has nothing to do with it.

So these are equivalent:

src/Hook/JddoesdevCoreEntityHooks.php   ✅
src/Hook/AllMyCoreEntityHooks.php       ✅
src/Hook/Entity/Presave.php             ✅ (namespace ...\Hook\Entity)
src/EntityHooks.php                     ❌ not under src/Hook/, never scanned

Run drush cr after adding or renaming a hook class. Discovery happens at container build time, and results are cached per file.
