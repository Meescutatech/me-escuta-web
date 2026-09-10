"use client";

import * as React from "react";
import PhoneInputLib, {
  formatPhoneNumber,
  getCountryCallingCode,
  isValidPhoneNumber,
  parsePhoneNumber,
  type Country,
  type Value,
} from "react-phone-number-input";
import flags from "react-phone-number-input/flags";
import pt from "react-phone-number-input/locale/pt.json";
export type UserPhone = { countryCode: string; dialCode: string; areaCode: string; nationalNumber: string; e164: string };
import { Command } from "cmdk";
import { CheckIcon, SearchIcon } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ChevronToggle } from "@/components/ui/chevron-toggle";
import { cn } from "@/lib/utils";

export const DEFAULT_PHONE_COUNTRY: Country = "BR";

type CountryOption = {
  value?: Country;
  label: string;
};

interface CountrySelectProps {
  value?: Country;
  onChange: (country?: Country) => void;
  options: CountryOption[];
  disabled?: boolean;
  iconComponent?: React.ComponentType<{ country?: Country; label?: string }>;
}

/**
 * Bandeira de país no tamanho do formulário. Exportada porque o seletor de
 * países das configurações de chamada (ADR 0118) precisa exatamente desta
 * caixinha — duplicar o `size-5` + o anel de 1px é como as duas versões
 * começam a divergir.
 */
export function CountryFlag({
  country,
  label,
}: {
  country?: Country;
  label?: string;
}) {
  if (!country) {
    return (
      <span
        aria-hidden
        className="flex size-5 items-center justify-center rounded-sm bg-muted text-[10px] font-semibold text-muted-foreground"
      >
        🌐
      </span>
    );
  }
  const Flag = flags[country];
  if (!Flag) return null;
  return (
    <span
      role="img"
      aria-label={label ?? country}
      className="flex size-5 items-center justify-center overflow-hidden rounded-sm shadow-[0_0_0_1px_oklch(0.13_0.005_240/0.08)] [&_svg]:size-full"
    >
      <Flag title={label ?? country} />
    </span>
  );
}

function CountrySelect({
  value,
  onChange,
  options,
  disabled,
}: CountrySelectProps) {
  const [open, setOpen] = React.useState(false);
  const items = React.useMemo(
    () =>
      options.filter((option): option is Required<CountryOption> =>
        Boolean(option.value),
      ),
    [options],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        disabled={disabled}
        aria-label="Selecionar país"
        className={cn(
          "group flex h-full shrink-0 items-center gap-1.5 border-r border-input bg-muted/40 pr-2 pl-2.5 text-sm font-medium text-foreground transition-colors",
          "hover:bg-muted/70 focus-visible:bg-muted/70 focus-visible:outline-none",
          "disabled:pointer-events-none disabled:opacity-50",
          "data-[popup-open]:bg-muted/70",
        )}
      >
        <CountryFlag country={value} />
        <span className="text-muted-foreground">
          {value ? `+${getCountryCallingCode(value)}` : ""}
        </span>
        <ChevronToggle className="size-3.5 opacity-60" />
      </PopoverTrigger>

      <PopoverContent align="start" sideOffset={6} className="w-[280px] p-0">
        <Command
          className="flex flex-col"
          filter={(searchValue, search) =>
            searchValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
          }
        >
          <div className="flex items-center gap-2 border-b border-border/60 px-3">
            <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
            <Command.Input
              placeholder="Buscar país..."
              className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <Command.List className="max-h-[260px] overflow-y-auto p-1">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              Nenhum país encontrado.
            </Command.Empty>

            {items.map((option) => {
              const dialCode = getCountryCallingCode(option.value);
              const isSelected = option.value === value;
              const searchKey = `${option.label} ${option.value} +${dialCode}`;
              return (
                <Command.Item
                  key={option.value}
                  value={searchKey}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm",
                    "data-[selected=true]:bg-muted data-[selected=true]:text-foreground",
                    isSelected && "bg-muted/60",
                  )}
                >
                  <CountryFlag country={option.value} label={option.label} />
                  <span className="flex-1 truncate">{option.label}</span>
                  <span className="text-xs text-muted-foreground">
                    +{dialCode}
                  </span>
                  {isSelected ? (
                    <CheckIcon className="size-4 text-primary" />
                  ) : null}
                </Command.Item>
              );
            })}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const PhoneNumberInput = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<"input">
>(function PhoneNumberInput({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      {...props}
      className={cn(
        "min-w-0 flex-1 border-0 bg-transparent px-3 text-[15px] text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed",
        className,
      )}
    />
  );
});

export interface PhoneInputProps {
  id?: string;
  value: Value | undefined;
  onChange: (value: Value | undefined) => void;
  defaultCountry?: Country;
  disabled?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  /** Foca o campo de número (não o seletor de país) ao montar. */
  autoFocus?: boolean;
}

function PhoneInput({
  id,
  value,
  onChange,
  defaultCountry = DEFAULT_PHONE_COUNTRY,
  disabled = false,
  readOnly = false,
  placeholder,
  className,
  autoFocus = false,
}: PhoneInputProps) {
  const parsed = value ? parsePhoneNumber(value) : undefined;
  const isLocked = disabled || readOnly;

  const LockedCountrySelect = React.useCallback(
    (props: CountrySelectProps) => (
      <CountrySelect {...props} disabled={isLocked || props.disabled} />
    ),
    [isLocked],
  );

  return (
    <PhoneInputLib
      id={id}
      international={false}
      country={parsed?.country ?? defaultCountry}
      defaultCountry={defaultCountry}
      countryCallingCodeEditable={false}
      limitMaxLength
      labels={pt}
      placeholder={placeholder}
      value={value}
      autoFocus={autoFocus}
      disabled={disabled}
      readOnly={readOnly}
      onChange={readOnly ? () => undefined : onChange}
      countrySelectComponent={LockedCountrySelect}
      inputComponent={PhoneNumberInput}
      className={cn(
        "flex h-10 w-full items-stretch overflow-hidden rounded-lg border border-input bg-background shadow-sm transition-colors",
        "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
        disabled && "cursor-not-allowed opacity-50",
        readOnly &&
          "cursor-default focus-within:border-input focus-within:ring-0",
        className,
      )}
    />
  );
}

export function formatPhoneDisplay(
  phone: string | null | undefined,
): string | undefined {
  if (!phone) return undefined;
  return formatPhoneNumber(phone as Value) || phone;
}

/**
 * O número está COMPLETO para o país escolhido?
 *
 * `Boolean(value)` não responde isso — e por anos o código agiu como se
 * respondesse. O `onChange` da biblioteca emite E.164 PARCIAL a cada tecla
 * (`+55`, `+5511`, `+551198…`), então "tem valor" significa apenas "alguém
 * começou a digitar". Um formulário que libera o envio nesse sinal manda
 * `+5511` para a API.
 *
 * Era `isPossiblePhoneNumber` (comprimento) e passou a ser `isValidPhoneNumber`
 * (padrão de faixa). A troca foi paga com um caso concreto: `(73) 98824-56`,
 * um celular pela metade, tem 11 dígitos com DDI e o teste de COMPRIMENTO o
 * aceitava como se fosse um fixo de 10. O modal então abria o campo de nome,
 * liberava o botão e cadastrava contato com número quebrado, para uma conversa
 * que nunca entregaria nada.
 *
 * O argumento anterior era que a autoridade final sobre o número existir é a
 * Meta, não uma tabela de faixas que envelhece. Ele continua verdadeiro, e o
 * SERVIDOR continua aceitando 8–15 dígitos com "+" — quem integra por API não
 * esbarra nesta tabela. O que mudou é o julgamento sobre onde o erro é mais
 * caro: aqui existe uma pessoa digitando, e a falha comum não é a faixa nova,
 * é o dígito que faltou.
 */
export function isPhoneComplete(value: Value | undefined): boolean {
  if (!value) return false;
  try {
    return isValidPhoneNumber(value);
  } catch {
    return false;
  }
}

export function toPhoneValue(
  phone: string | null | undefined,
): Value | undefined {
  if (!phone) return undefined;
  const parsed = parsePhoneNumber(phone);
  return (parsed?.number ?? phone) as Value;
}

/**
 * Splits a phone value into its DDI (dial code), DDD (area code) and national
 * number, all formatted for storage/display. Returns `null` for empty/invalid
 * input so the stored value can be cleared explicitly.
 */
export function buildPhoneDetails(
  phone: string | null | undefined,
): UserPhone | null {
  if (!phone) return null;

  const parsed = parsePhoneNumber(phone as Value);
  if (!parsed) return null;

  const nationalDigits = parsed.nationalNumber ?? "";
  // Brazilian national numbers are 10 (landline) or 11 (mobile) digits and
  // always start with the 2-digit DDD.
  const areaCode =
    parsed.country === "BR" && nationalDigits.length >= 10
      ? nationalDigits.slice(0, 2)
      : "";

  return {
    countryCode: parsed.country ?? "",
    dialCode: `+${parsed.countryCallingCode}`,
    areaCode,
    nationalNumber: parsed.formatNational(),
    e164: parsed.number,
  };
}

export { PhoneInput };
