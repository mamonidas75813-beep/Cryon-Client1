package client.nova.hud;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.entity.LivingEntity;
import net.minecraft.util.hit.EntityHitResult;
import org.lwjgl.glfw.GLFW;

import java.io.Reader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.Deque;

/** Client-only HUD. The launcher writes config/nova-hud.json; no server plugin is needed. */
public final class NovaHudClient implements ClientModInitializer {
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
    private static final Path CONFIG = FabricLoader.getInstance().getConfigDir().resolve("nova-hud.json");
    private static JsonObject options = defaults();
    private static final Deque<Long> leftClicks = new ArrayDeque<>();
    private static final Deque<Long> rightClicks = new ArrayDeque<>();
    private static boolean leftWasDown;
    private static boolean rightWasDown;
    private static long lastConfigCheck;

    @Override public void onInitializeClient() {
        loadConfig();
        ClientTickEvents.END_CLIENT_TICK.register(client -> {
            updateClicks(client);
            if (System.currentTimeMillis() - lastConfigCheck > 2500) {
                lastConfigCheck = System.currentTimeMillis();
                loadConfig();
            }
        });
        HudRenderCallback.EVENT.register((context, tickCounter) -> render(context));
    }

    private static JsonObject defaults() {
        JsonObject json = new JsonObject();
        for (String key : new String[]{"fps", "ping", "coordinates", "direction", "keystrokes", "cps", "armor", "potions", "target", "sprint", "crosshair", "durability", "itemCount"}) json.addProperty(key, true);
        return json;
    }

    private static void loadConfig() {
        if (!Files.exists(CONFIG)) return;
        try (Reader reader = Files.newBufferedReader(CONFIG)) {
            JsonObject loaded = GSON.fromJson(reader, JsonObject.class);
            if (loaded != null) options = loaded;
        } catch (Exception ignored) { /* Keep last known valid settings. */ }
    }

    private static boolean enabled(String key) {
        return !options.has(key) || options.get(key).getAsBoolean();
    }

    private static void updateClicks(MinecraftClient client) {
        if (client.getWindow() == null) return;
        long window = client.getWindow().getHandle();
        boolean left = GLFW.glfwGetMouseButton(window, GLFW.GLFW_MOUSE_BUTTON_LEFT) == GLFW.GLFW_PRESS;
        boolean right = GLFW.glfwGetMouseButton(window, GLFW.GLFW_MOUSE_BUTTON_RIGHT) == GLFW.GLFW_PRESS;
        long now = System.currentTimeMillis();
        if (left && !leftWasDown) leftClicks.addLast(now);
        if (right && !rightWasDown) rightClicks.addLast(now);
        leftWasDown = left;
        rightWasDown = right;
        trimClicks(leftClicks, now); trimClicks(rightClicks, now);
    }

    private static void trimClicks(Deque<Long> clicks, long now) {
        while (!clicks.isEmpty() && now - clicks.peekFirst() > 1000) clicks.removeFirst();
    }

    private static void render(DrawContext context) {
        MinecraftClient client = MinecraftClient.getInstance();
        if (client.player == null || client.world == null) return;
        int x = 8, y = 8, color = 0xFFE6E9FF;
        if (enabled("fps")) y = line(context, client, "FPS: " + client.getCurrentFps(), x, y, color);
        if (enabled("ping")) y = line(context, client, "Ping: " + ping(client), x, y, color);
        if (enabled("coordinates")) {
            var p = client.player.getPos();
            y = line(context, client, String.format("XYZ: %.1f / %.1f / %.1f", p.x, p.y, p.z), x, y, color);
        }
        if (enabled("direction")) y = line(context, client, "Facing: " + client.player.getHorizontalFacing().asString().toUpperCase(), x, y, color);
        if (enabled("keystrokes")) y = line(context, client, keys(client), x, y, color);
        if (enabled("cps")) y = line(context, client, "CPS: " + leftClicks.size() + " | " + rightClicks.size(), x, y, color);
        if (enabled("sprint") && client.player.isSprinting()) y = line(context, client, "SPRINTING", x, y, 0xFF8BFFB8);
        if (enabled("armor")) {
            StringBuilder armor = new StringBuilder("Armor: ");
            boolean found = false;
            for (var stack : client.player.getArmorItems()) {
                if (!stack.isEmpty()) { if (found) armor.append(" · "); armor.append(stack.getName().getString()); found = true; }
            }
            if (found) y = line(context, client, armor.toString(), x, y, color);
        }
        if (enabled("potions") && !client.player.getStatusEffects().isEmpty()) {
            StringBuilder effects = new StringBuilder("Effects: ");
            client.player.getStatusEffects().stream().limit(3).forEach(effect -> {
                if (effects.length() > 9) effects.append(" · ");
                effects.append(effect.getEffectType().value().getName().getString());
            });
            y = line(context, client, effects.toString(), x, y, color);
        }
        if (enabled("target") && client.crosshairTarget instanceof EntityHitResult hit && hit.getEntity() instanceof LivingEntity target) {
            y = line(context, client, "Target: " + target.getName().getString() + " " + Math.round(target.getHealth()) + " HP", x, y, 0xFFFFC28C);
        }
        var held = client.player.getMainHandStack();
        if (enabled("itemCount") && !held.isEmpty()) y = line(context, client, "Item: " + held.getName().getString() + " x" + held.getCount(), x, y, color);
        if (enabled("durability") && held.isDamageable()) {
            int remaining = held.getMaxDamage() - held.getDamage();
            int percent = Math.round(remaining * 100.0f / held.getMaxDamage());
            y = line(context, client, "Durability: " + percent + "%", x, y, percent < 20 ? 0xFFFF8D8D : color);
        }
        if (enabled("crosshair")) {
            int cx = client.getWindow().getScaledWidth() / 2;
            int cy = client.getWindow().getScaledHeight() / 2;
            context.fill(cx - 4, cy, cx + 5, cy + 1, 0xDDF4F6FF);
            context.fill(cx, cy - 4, cx + 1, cy + 5, 0xDDF4F6FF);
        }
    }

    private static int line(DrawContext context, MinecraftClient client, String text, int x, int y, int color) {
        context.drawTextWithShadow(client.textRenderer, text, x, y, color);
        return y + 11;
    }

    private static String keys(MinecraftClient client) {
        return "[" + key(client.options.forwardKey.isPressed(), "W") + "] [" + key(client.options.leftKey.isPressed(), "A") + "] [" + key(client.options.backKey.isPressed(), "S") + "] [" + key(client.options.rightKey.isPressed(), "D") + "] [" + key(client.options.jumpKey.isPressed(), "SPACE") + "]";
    }

    private static String key(boolean down, String label) { return down ? label : "·"; }

    private static String ping(MinecraftClient client) {
        if (client.getNetworkHandler() == null || client.player == null) return "—";
        var entry = client.getNetworkHandler().getPlayerListEntry(client.player.getUuid());
        return entry == null ? "—" : entry.getLatency() + " ms";
    }
}
