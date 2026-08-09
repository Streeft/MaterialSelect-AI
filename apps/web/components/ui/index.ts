/**
 * The design system's public surface.
 *
 * Screens import from `@/components/ui`, never from the individual files, so
 * that a primitive can be split or renamed without touching call sites — and so
 * that a reviewer can see at a glance whether a new screen used the system or
 * hand-rolled its own controls again.
 */

export { Alert, type AlertTone } from "./Alert";
export { Badge, ClassBadge, type BadgeTone } from "./Badge";
export {
  Button,
  ButtonGroup,
  ButtonGroupItem,
  ButtonLink,
  IconButton,
  ToggleChip,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
} from "./Button";
export { Card, CardBody, CardFooter, CardHeader, Section } from "./Card";
export {
  DataQualityBadge,
  DataQualityLegend,
  MissingValue,
  type QualityState,
} from "./DataQualityBadge";
export { Dialog } from "./Dialog";
export { EmptyState, ErrorState, LoadingState, Skeleton, Spinner } from "./Feedback";
export {
  Checkbox,
  Field,
  Fieldset,
  Input,
  NumberInput,
  RadioGroup,
  RadioOption,
  Select,
  Textarea,
} from "./Field";
export { Disclosure, Popover } from "./Popover";
export {
  ProvenanceDetails,
  ProvenancePopover,
  provenanceOfCell,
  provenanceOfProperty,
  qualityState,
  type Provenance,
} from "./ProvenancePopover";
export { Stepper, type Step, type StepStatus } from "./Stepper";
export {
  TBody,
  THead,
  Table,
  TableCaption,
  TableScroll,
  Td,
  Th,
  RowHeader,
  Tr,
} from "./Table";
export { TabPanel, Tabs, type TabItem } from "./Tabs";
export { ThemeToggle, useResolvedTheme } from "./ThemeToggle";
