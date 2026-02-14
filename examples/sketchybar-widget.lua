-- ocn sketchybar widget
-- Drop-in for ~/.config/sketchybar/items/widgets/
-- Requires: ocn-tmux-status in PATH (or use full path to bun + script)
-- Uses settings from your sketchybar config.settings module

local settings = require("config.settings")
local colors = settings.colors

-- ocn colors (TokyoNight)
local ocn_colors = {
  idle = colors.green or 0xff9ece6a,
  busy = colors.yellow or 0xffe0af68,
  prompting = colors.red or 0xfff7768e,
  error = colors.red or 0xfff7768e,
  muted = 0xff565f89,
  bg = colors.bg1 or 0xff1a1b26,
}

local ocn = sbar.add("item", "widgets.ocn", {
  position = "right",
  icon = {
    string = "󱚣",
    font = {
      family = settings.fonts.nerd,
      size = 13.0,
    },
    color = settings.colors.fg,
    padding_right = 0,
  },
  label = {
    string = "",
    font = {
      family = settings.fonts.text,
      size = 13.0,
    },
    color = settings.colors.fg,
    padding_left = 6,
    padding_right = 6,
  },
  background = {
    color = settings.colors.bg_light,
  },
  padding_right = 4,
  update_freq = 5,
  drawing = true,
})

sbar.add("event", "ocn_update")

local function update()
  sbar.exec("/opt/homebrew/bin/bun /Users/tom/.local/bin/ocn-tmux-status --json 2>/dev/null", function(data)
    -- sbar.exec auto-parses JSON output into a table
    local total, busy, prompting, err, idle

    if type(data) == "table" then
      total = data.total or 0
      busy = data.busy or 0
      prompting = data.prompting or 0
      err = data.error or 0
      idle = data.idle or 0
    elseif type(data) == "string" and data ~= "" then
      total = tonumber(data:match('"total":(%d+)')) or 0
      busy = tonumber(data:match('"busy":(%d+)')) or 0
      prompting = tonumber(data:match('"prompting":(%d+)')) or 0
      err = tonumber(data:match('"error":(%d+)')) or 0
      idle = tonumber(data:match('"idle":(%d+)')) or 0
    else
      total = 0
      busy = 0
      prompting = 0
      err = 0
      idle = 0
    end

    local attention = prompting + err

    -- No instances: show "0"
    if total == 0 then
      ocn:set({
        icon = { color = settings.colors.grey },
        label = { string = "0", color = settings.colors.grey },
      })
      return
    end

    -- Build label parts: attention > busy > idle
    local parts = {}
    if attention > 0 then
      table.insert(parts, tostring(attention) .. " !")
    end
    if busy > 0 then
      table.insert(parts, tostring(busy) .. " ~")
    end
    if idle > 0 then
      table.insert(parts, tostring(idle) .. " ✓")
    end

    -- Icon color: red if attention, yellow if busy, grey if all idle
    local icon_color = settings.colors.grey
    if attention > 0 then
      icon_color = ocn_colors.prompting
    elseif busy > 0 then
      icon_color = ocn_colors.busy
    end

    ocn:set({
      icon = { color = icon_color },
      label = {
        string = table.concat(parts, "  "),
        color = icon_color,
      },
    })
  end)
end

ocn:subscribe({ "routine", "forced", "ocn_update" }, update)

ocn:subscribe("mouse.clicked", function(env)
  sbar.exec("/opt/homebrew/bin/bun /Users/tom/.local/bin/ocn-tmux-status --json 2>/dev/null", function(result)
    if not result or result == "" then return end
    ocn:set({ popup = { drawing = "toggle" } })
  end)
end)
