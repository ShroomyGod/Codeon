/**
 * Luau snippets handed to Studio's `execute_luau` tool.
 *
 * Studio's MCP server exposes rich *reads* (search_game_tree, inspect_instance,
 * script_read) but no typed property writer, so writes go through generated
 * Luau. Everything here is built from JSON-escaped literals — never string
 * concatenation of raw user input — and every snippet returns a string so the
 * result is printable in the transcript.
 */

/** Resolves a dot-notation path such as `game.Workspace.Baseplate`. */
const RESOLVE_PATH = `
local function codeonResolvePath(dotPath)
	if type(dotPath) ~= "string" or dotPath == "" then return nil end
	local cleaned = dotPath:gsub("^game%.", "")
	if cleaned == "" then return game end
	local current = game
	for segment in cleaned:gmatch("[^%.]+") do
		local nextNode
		if current == game then
			nextNode = game:FindFirstChild(segment)
			if not nextNode then
				local ok, service = pcall(function() return game:GetService(segment) end)
				if ok then nextNode = service end
			end
		else
			nextNode = current:FindFirstChild(segment)
		end
		if not nextNode then return nil end
		current = nextNode
	end
	return current
end
`.trim()

/** Coerces a string into the type of the property's current value. */
const COERCE = `
local function codeonNumbers(raw)
	local out = {}
	for token in tostring(raw):gmatch("[%-%d%.]+") do
		local value = tonumber(token)
		if value then table.insert(out, value) end
	end
	return out
end

local function codeonCoerce(instance, property, raw)
	local ok, current = pcall(function() return instance[property] end)
	local kind = ok and typeof(current) or nil

	if kind == "Vector3" then
		local n = codeonNumbers(raw)
		if #n >= 3 then return Vector3.new(n[1], n[2], n[3]) end
	elseif kind == "Vector2" then
		local n = codeonNumbers(raw)
		if #n >= 2 then return Vector2.new(n[1], n[2]) end
	elseif kind == "Color3" then
		local hex = tostring(raw):match("^#?(%x%x%x%x%x%x)$")
		if hex then return Color3.fromHex("#" .. hex) end
		local n = codeonNumbers(raw)
		if #n >= 3 then
			local scale = (n[1] > 1 or n[2] > 1 or n[3] > 1) and 255 or 1
			return Color3.new(n[1] / scale, n[2] / scale, n[3] / scale)
		end
	elseif kind == "UDim2" then
		local n = codeonNumbers(raw)
		if #n >= 4 then return UDim2.new(n[1], n[2], n[3], n[4]) end
	elseif kind == "UDim" then
		local n = codeonNumbers(raw)
		if #n >= 2 then return UDim.new(n[1], n[2]) end
	elseif kind == "CFrame" then
		local n = codeonNumbers(raw)
		if #n >= 3 then
			local base = CFrame.new(n[1], n[2], n[3])
			if #n >= 6 then
				return base * CFrame.Angles(math.rad(n[4]), math.rad(n[5]), math.rad(n[6]))
			end
			return base
		end
	elseif kind == "BrickColor" then
		local number = tonumber(raw)
		if number then
			local ok2, brick = pcall(function() return BrickColor.new(number) end)
			if ok2 then return brick end
		end
		local ok3, brick = pcall(function() return BrickColor.new(tostring(raw)) end)
		if ok3 then return brick end
	elseif kind == "EnumItem" then
		local ok4, item = pcall(function() return current.EnumType[tostring(raw)] end)
		if ok4 then return item end
	elseif kind == "boolean" then
		local lowered = tostring(raw):lower()
		return lowered == "true" or lowered == "1" or lowered == "yes"
	elseif kind == "number" then
		local number = tonumber(raw) or tonumber(tostring(raw):match("[%-%d%.]+"))
		if number then return number end
	end

	return raw
end
`.trim()

function luauString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n')}"`
}

export interface SetPropertyRequest {
  path: string
  property: string
  value: string
}

/**
 * Sets one property (or `@attribute`) and returns a human-readable result.
 * The value is coerced against the property's existing type at runtime.
 */
export function buildSetProperty(request: SetPropertyRequest): string {
  const property = request.property.startsWith('@') ? request.property.slice(1) : request.property
  const isAttribute = request.property.startsWith('@')

  const assign = isAttribute
    ? `instance:SetAttribute(${luauString(property)}, codeonCoerce(instance, ${luauString(property)}, raw))`
    : `instance[${luauString(property)}] = codeonCoerce(instance, ${luauString(property)}, raw)`

  const readBack = isAttribute
    ? `tostring(instance:GetAttribute(${luauString(property)}))`
    : `tostring(instance[${luauString(property)}])`

  return [
    RESOLVE_PATH,
    COERCE,
    `local path = ${luauString(request.path)}`,
    `local raw = ${luauString(request.value)}`,
    'local instance = codeonResolvePath(path)',
    'if not instance then return "No instance at " .. path end',
    'local ok, err = pcall(function()',
    `\t${assign}`,
    'end)',
    `if not ok then return ${luauString(`Failed to set ${request.path}.${property} -> `)} .. tostring(err) end`,
    `local value = ${readBack}`,
    `return ${luauString(`${request.path}.${property} = `)} .. tostring(value)`
  ].join('\n')
}

/** Reads a property list as readable text, for the properties panel. */
export function buildReadProperty(path: string, property: string): string {
  const isAttribute = property.startsWith('@')
  const name = isAttribute ? property.slice(1) : property
  return [
    RESOLVE_PATH,
    `local instance = codeonResolvePath(${luauString(path)})`,
    `if not instance then return ${luauString(`No instance at ${path}`)} end`,
    isAttribute
      ? `return tostring(instance:GetAttribute(${luauString(name)}))`
      : `local ok, value = pcall(function() return instance[${luauString(name)}] end)\nif not ok then return "unreadable" end\nreturn tostring(value)`
  ].join('\n')
}

/**
 * Lists an instance's readable properties and attributes as `name<TAB>value` lines.
 *
 * `inspect_instance` returns an empty property list for services — Studio's MCP
 * server cannot enumerate them — while Studio's own Properties window shows them
 * all, so the panel falls back to this. Property names come from
 * `ReflectionService`, which reports them for any class, and values are formatted
 * the way `inspect_instance` and {@link buildSetProperty} expect, so what is shown
 * can also be edited back.
 */
export function buildListProperties(path: string): string {
  return [
    RESOLVE_PATH,
    FORMAT_VALUE,
    `local instance = codeonResolvePath(${luauString(path)})`,
    'if not instance then return "" end',
    '',
    'local names, seen = {}, {}',
    'local ok, reflection = pcall(function() return game:GetService("ReflectionService") end)',
    'if ok and reflection then',
    '\tlocal listed',
    '\tlocal ok2 = pcall(function() listed = reflection:GetPropertiesOfClass(instance.ClassName) end)',
    '\tif ok2 and type(listed) == "table" then',
    '\t\tfor _, entry in ipairs(listed) do',
    '\t\t\tlocal name = type(entry) == "table" and entry.Name or nil',
    '\t\t\tif type(name) == "string" and not seen[name] then',
    '\t\t\t\tseen[name] = true',
    '\t\t\t\ttable.insert(names, name)',
    '\t\t\tend',
    '\t\tend',
    '\tend',
    'end',
    '',
    'local lines = {}',
    'for _, name in ipairs(names) do',
    '\tlocal ok3, value = pcall(function() return instance[name] end)',
    '\tif ok3 and value ~= nil then',
    '\t\tlocal text = codeonFormat(value)',
    '\t\tif text then table.insert(lines, name .. "\\t" .. text) end',
    '\tend',
    'end',
    '',
    '-- Attributes read and write through the "@" prefix, as in the panel.',
    'local ok4, attributes = pcall(function() return instance:GetAttributes() end)',
    'if ok4 and type(attributes) == "table" then',
    '\tlocal attributeNames = {}',
    '\tfor name in pairs(attributes) do table.insert(attributeNames, name) end',
    '\ttable.sort(attributeNames)',
    '\tfor _, name in ipairs(attributeNames) do',
    '\t\tlocal text = codeonFormat(attributes[name])',
    '\t\tif text then table.insert(lines, "@" .. name .. "\\t" .. text) end',
    '\tend',
    'end',
    '',
    'return table.concat(lines, "\\n")'
  ].join('\n')
}

/** Renders a property value as the text the properties panel shows. */
const FORMAT_VALUE = `
local function codeonFormat(value)
	local kind = typeof(value)
	if kind == "Vector3" then
		return string.format("%s, %s, %s", value.X, value.Y, value.Z)
	elseif kind == "Vector2" then
		return string.format("%s, %s", value.X, value.Y)
	elseif kind == "Color3" then
		return string.format("%s, %s, %s", value.R, value.G, value.B)
	elseif kind == "UDim2" then
		return string.format("%s, %s, %s, %s", value.X.Scale, value.X.Offset, value.Y.Scale, value.Y.Offset)
	elseif kind == "UDim" then
		return string.format("%s, %s", value.Scale, value.Offset)
	elseif kind == "CFrame" then
		-- Position plus Euler angles in degrees, which is what codeonCoerce parses.
		local position = value.Position
		local rx, ry, rz = value:ToEulerAnglesXYZ()
		return string.format(
			"%s, %s, %s, %s, %s, %s",
			position.X, position.Y, position.Z,
			math.deg(rx), math.deg(ry), math.deg(rz)
		)
	elseif kind == "EnumItem" then
		return "Enum." .. tostring(value.EnumType) .. "." .. value.Name
	elseif kind == "Instance" then
		return value:GetFullName()
	elseif kind == "BrickColor" then
		return value.Name
	elseif kind == "number" or kind == "string" or kind == "boolean" then
		return tostring(value)
	end
	-- Tables, functions and other unserializable values are left out.
	return nil
end
`.trim()

/** Returns the current Studio selection, which MCP does not expose directly. */
export function buildGetSelection(): string {
  return [
    RESOLVE_PATH,
    'local ok, selection = pcall(function() return game:GetService("Selection"):Get() end)',
    'if not ok or not selection then return "" end',
    'local paths = {}',
    'for _, instance in ipairs(selection) do',
    '\ttable.insert(paths, instance:GetFullName())',
    'end',
    'return table.concat(paths, "\\n")'
  ].join('\n')
}

/** Creates an instance under a parent path and returns its full name. */
export function buildCreateInstance(input: {
  parent: string
  className: string
  name: string
  properties?: Record<string, string>
}): string {
  const lines = [
    RESOLVE_PATH,
    COERCE,
    `local parent = codeonResolvePath(${luauString(input.parent)})`,
    `if not parent then return "No parent at " .. ${luauString(input.parent)} end`,
    `local instance = Instance.new(${luauString(input.className)})`,
    `instance.Name = ${luauString(input.name)}`,
    'local applied, failed = {}, {}'
  ]

  for (const [key, value] of Object.entries(input.properties ?? {})) {
    lines.push('do')
    lines.push(`\tlocal property = ${luauString(key)}`)
    lines.push(`\tlocal raw = ${luauString(value)}`)
    lines.push(
      '\tlocal ok = pcall(function() instance[property] = codeonCoerce(instance, property, raw) end)'
    )
    lines.push('\tif ok then table.insert(applied, property) else table.insert(failed, property) end')
    lines.push('end')
  }

  lines.push('instance.Parent = parent')
  lines.push(
    'local summary = "Created " .. instance.ClassName .. " " .. instance:GetFullName()\n' +
      'if #failed > 0 then summary = summary .. " (could not set: " .. table.concat(failed, ", ") .. ")" end\n' +
      'return summary'
  )

  return lines.join('\n')
}

/** Destroys an instance and returns its former full name. */
export function buildDeleteInstance(path: string): string {
  return [
    RESOLVE_PATH,
    `local instance = codeonResolvePath(${luauString(path)})`,
    `if not instance then return ${luauString(`No instance at ${path}`)} end`,
    'if instance == game then return "Refusing to delete the DataModel." end',
    'local fullName = instance:GetFullName()',
    'instance:Destroy()',
    'return "Deleted " .. fullName'
  ].join('\n')
}
