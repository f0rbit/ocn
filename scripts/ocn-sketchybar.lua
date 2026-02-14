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
    string = "󰘳",
    font = {
      family = settings.fonts.icons,
      style = "Regular",
      size = 14.0,
    },
    color = ocn_colors.muted,
  },
  label = {
    string = "",
    font = {
      family = settings.fonts.text,
      style = "Medium",
      size = 12.0,
    },
    color = ocn_colors.muted,
  },
  background = {
    color = ocn_colors.bg,
    border_width = 0,
  },
  update_freq = 5,
  drawing = false,
})

sbar.add("event", "ocn_update")

local function update()
  sbar.exec("ocn-tmux-status --json 2>/dev/null", function(result)
    if not result or result == "" then
      ocn:set({ drawing = false })
      return
    end

    local ok, data = pcall(function() return require("json").decode(result) end)
    if not ok then
      local total = tonumber(result:match('"total":(%d+)'))
      local busy = tonumber(result:match('"busy":(%d+)'))
      local prompting = tonumber(result:match('"prompting":(%d+)'))
      local err = tonumber(result:match('"error":(%d+)'))

      if not total or total == 0 then
        ocn:set({ drawing = false })
        return
      end

      data = {
        total = total,
        busy = busy or 0,
        prompting = prompting or 0,
        error = err or 0,
        idle = total - (busy or 0) - (prompting or 0) - (err or 0),
      }
    end

    if data.total == 0 then
      ocn:set({ drawing = false })
      return
    end

    local attention = (data.prompting or 0) + (data.error or 0)
    local busy = data.busy or 0

    if attention == 0 and busy == 0 then
      ocn:set({ drawing = false })
      return
    end

    local parts = {}
    if attention > 0 then
      table.insert(parts, tostring(attention) .. "!")
    end
    if busy > 0 then
      table.insert(parts, tostring(busy) .. "~")
    end

    local icon_color = ocn_colors.busy
    if attention > 0 then
      icon_color = ocn_colors.prompting
    end

    ocn:set({
      drawing = true,
      icon = { color = icon_color },
      label = {
        string = table.concat(parts, " "),
        color = icon_color,
      },
    })
  end)
end

ocn:subscribe({ "routine", "forced", "ocn_update" }, update)

ocn:subscribe("mouse.clicked", function(env)
  sbar.exec("ocn-tmux-status --json 2>/dev/null", function(result)
    if not result or result == "" then return end
    ocn:set({ popup = { drawing = "toggle" } })
  end)
end)
