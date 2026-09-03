/**
 * A superfície pública do design system.
 *
 * As telas importam de `@/components/ui`, nunca dos arquivos individuais, para
 * que um primitivo possa ser dividido ou renomeado sem tocar em call sites — e
 * para que um revisor veja de relance se uma tela nova usou o sistema ou
 * escreveu os próprios controles à mão outra vez.
 */

export { Alert, type AlertTone } from "./Alert";
export { Badge, ClassBadge, type BadgeTone } from "./Badge";
export { Bar } from "./Bar";
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
export { Card, CardBody, CardFooter, CardHeader, PanelShell, Section } from "./Card";
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
  SelectOption,
  Textarea,
  CONTROL,
  useWiring,
} from "./Field";
export { PageHeader } from "./PageHeader";
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
export { Tabs, type TabItem } from "./Tabs";
export { ThemeToggle, useResolvedTheme } from "./ThemeToggle";
