"""Typed format primitives for the Plan 10a precedence resolver.

References:
    - Build_Tableau.md §XIV.1 precedence chain (Mark > Field > Worksheet > DS > Workbook)
    - Build_Tableau.md §XIV.5 shading / borders / dividers
    - Build_Tableau.md §XIV.6 StyledBox + LineStyle
    - Appendix C: tabstylemodel / tabdocformatting
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from types import MappingProxyType
from typing import Mapping, Union


class StyleProp(str, Enum):
    FONT_FAMILY = "font-family"
    FONT_SIZE = "font-size"
    FONT_WEIGHT = "font-weight"
    FONT_STYLE = "font-style"
    COLOR = "color"
    BACKGROUND_COLOR = "background-color"
    TEXT_DECORATION = "text-decoration"
    TEXT_ALIGN = "text-align"
    LINE_HEIGHT = "line-height"
    NUMBER_FORMAT = "number-format"
    DATE_FORMAT = "date-format"
    BORDER_TOP = "border-top"
    BORDER_RIGHT = "border-right"
    BORDER_BOTTOM = "border-bottom"
    BORDER_LEFT = "border-left"
    PADDING = "padding"
    SHOW_COLUMN_BANDING = "show-column-banding"
    SHOW_ROW_BANDING = "show-row-banding"
    AXIS_TICK_COLOR = "axis-tick-color"
    ZERO_LINE_COLOR = "zero-line-color"
    PANE_LINE_THICKNESS = "pane-line-thickness"


# --- Selectors ----------------------------------------------------------

@dataclass(frozen=True)
class MarkSelector:
    mark_id: str
    kind: str = "mark"


@dataclass(frozen=True)
class FieldSelector:
    field_id: str
    kind: str = "field"


@dataclass(frozen=True)
class WorksheetSelector:
    sheet_id: str
    kind: str = "sheet"


@dataclass(frozen=True)
class DataSourceSelector:
    ds_id: str
    kind: str = "ds"


@dataclass(frozen=True)
class WorkbookSelector:
    kind: str = "workbook"


Selector = Union[
    MarkSelector, FieldSelector, WorksheetSelector, DataSourceSelector, WorkbookSelector
]


_SPECIFICITY = {
    "mark": 5,
    "field": 4,
    "sheet": 3,
    "ds": 2,
    "workbook": 1,
}


def selector_specificity(s: Selector) -> int:
    """Higher = more specific. Used by resolver walk order."""
    return _SPECIFICITY[s.kind]


# --- StyleRule ----------------------------------------------------------

@dataclass(frozen=True)
class StyleRule:
    selector: Selector
    properties: Mapping[StyleProp, object]

    def __post_init__(self) -> None:
        # Freeze to prevent downstream mutation from leaking into memoised results.
        object.__setattr__(self, "properties", MappingProxyType(dict(self.properties)))


# --- LineStyle / StyledBox / RichText ----------------------------------

@dataclass(frozen=True)
class LineStyle:
    weight: int = 1
    color: str = "#000000"
    dash: str = "solid"  # "solid" | "dashed" | "dotted" | "dash-dot"


DEFAULT_LINE_STYLE = LineStyle()


@dataclass(frozen=True)
class Shadow:
    x: int = 0
    y: int = 0
    blur: int = 0
    color: str = "#00000000"


@dataclass(frozen=True)
class StyledBox:
    background_color: str = "#ffffff"
    background_opacity: float = 1.0
    border_top: LineStyle = field(default_factory=LineStyle)
    border_right: LineStyle = field(default_factory=LineStyle)
    border_bottom: LineStyle = field(default_factory=LineStyle)
    border_left: LineStyle = field(default_factory=LineStyle)
    shadow: Shadow | None = None


DEFAULT_STYLED_BOX = StyledBox()


@dataclass(frozen=True)
class RichTextRun:
    text: str
    style: Mapping[StyleProp, object] = field(default_factory=dict)

    def __post_init__(self) -> None:
        object.__setattr__(self, "style", MappingProxyType(dict(self.style)))


@dataclass(frozen=True)
class RichText:
    runs: tuple[RichTextRun, ...] = ()
