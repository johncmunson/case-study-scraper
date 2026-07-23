"use client"

import { useId, useRef, useState, type FormEvent } from "react"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Spinner } from "@/components/ui/spinner"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ScrapeRunApiError } from "@/lib/scrape-runs/api-contracts"
import type { NewScrapeRunInput } from "@/lib/scrape-runs/new-scrape-run"

const MIN_EXAMPLE_URLS = 2
const MAX_EXAMPLE_URLS = 5
const MIN_FIELDS = 1
const MAX_FIELDS = 10
const TOAST_POSITION = "bottom-center" as const

type ExampleUrl = {
  id: number
}

type ExtractField = {
  id: number
  required: boolean
  primaryIdentifier: boolean
}

type NewScrapeRunFormProps = {
  hasActiveRun: boolean
  isMutating: boolean
  onCreate: (input: NewScrapeRunInput) => Promise<unknown>
  onSuccess: () => void
}

function NewScrapeRunForm({
  hasActiveRun,
  isMutating,
  onCreate,
  onSuccess,
}: NewScrapeRunFormProps) {
  const formId = useId()
  const nextExampleUrlId = useRef(MIN_EXAMPLE_URLS)
  const nextFieldId = useRef(MIN_FIELDS)
  const [exampleUrls, setExampleUrls] = useState<ExampleUrl[]>([
    { id: 0 },
    { id: 1 },
  ])
  const [fields, setFields] = useState<ExtractField[]>([
    { id: 0, required: true, primaryIdentifier: true },
  ])

  function addExampleUrl() {
    setExampleUrls((current) => {
      if (current.length >= MAX_EXAMPLE_URLS) {
        return current
      }

      const nextId = nextExampleUrlId.current
      nextExampleUrlId.current += 1
      return [...current, { id: nextId }]
    })
  }

  function removeExampleUrl(id: number) {
    setExampleUrls((current) =>
      current.length > MIN_EXAMPLE_URLS
        ? current.filter((exampleUrl) => exampleUrl.id !== id)
        : current,
    )
  }

  function addField() {
    setFields((current) => {
      if (current.length >= MAX_FIELDS) {
        return current
      }

      const nextId = nextFieldId.current
      nextFieldId.current += 1
      return [
        ...current,
        { id: nextId, required: false, primaryIdentifier: false },
      ]
    })
  }

  function removeField(id: number) {
    setFields((current) => {
      if (current.length <= MIN_FIELDS) {
        return current
      }

      const removedField = current.find((field) => field.id === id)
      const remainingFields = current.filter((field) => field.id !== id)

      if (!removedField?.primaryIdentifier) {
        return remainingFields
      }

      return remainingFields.map((field, index) =>
        index === 0
          ? { ...field, required: true, primaryIdentifier: true }
          : field,
      )
    })
  }

  function updateRequired(id: number, required: boolean) {
    setFields((current) =>
      current.map((field) =>
        field.id === id && !field.primaryIdentifier
          ? { ...field, required }
          : field,
      ),
    )
  }

  function selectPrimaryIdentifier(id: number) {
    setFields((current) =>
      current.map((field) => ({
        ...field,
        required: field.id === id ? true : field.required,
        primaryIdentifier: field.id === id,
      })),
    )
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (hasActiveRun || isMutating) {
      return
    }

    const formData = new FormData(event.currentTarget)
    const payload: NewScrapeRunInput = {
      name: String(formData.get("name") ?? ""),
      url: String(formData.get("url") ?? ""),
      exampleUrls: exampleUrls.map((exampleUrl) =>
        String(formData.get(`exampleUrl-${exampleUrl.id}`) ?? ""),
      ),
      fields: fields.map((field) => ({
        label: String(formData.get(`field-${field.id}-label`) ?? ""),
        description: String(
          formData.get(`field-${field.id}-description`) ?? "",
        ),
        required: field.required,
        primaryIdentifier: field.primaryIdentifier,
      })),
    }

    try {
      await onCreate(payload)
      toast.success("New scrape run created", {
        position: TOAST_POSITION,
      })
      onSuccess()
    } catch (error) {
      const message =
        error instanceof ScrapeRunApiError
          ? error.message
          : "Unable to create the scrape run."

      toast.warning(`Error: ${message}`, {
        position: TOAST_POSITION,
      })
    }
  }

  return (
    <form
      className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-4"
      aria-busy={isMutating}
      onSubmit={handleSubmit}
    >
      <fieldset className="contents" disabled={isMutating}>
        <div className="min-h-0 space-y-6 overflow-y-auto px-1 pb-1">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`${formId}-name`}>Name</FieldLabel>
              <Input id={`${formId}-name`} name="name" required />
            </Field>

            <Field>
              <FieldLabel htmlFor={`${formId}-url`}>URL</FieldLabel>
              <Input
                id={`${formId}-url`}
                name="url"
                type="url"
                placeholder="https://example.com/case-studies"
                required
              />
            </Field>
          </FieldGroup>

          <FieldSet>
            <FieldLegend>Example URLs</FieldLegend>
            <div className="-mt-2 flex items-start justify-between gap-4">
              <FieldDescription>
                Add 2–5 pages that represent the content to scrape.
              </FieldDescription>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={exampleUrls.length >= MAX_EXAMPLE_URLS}
                onClick={addExampleUrl}
              >
                <PlusIcon />
                Add URL
              </Button>
            </div>

            <FieldGroup className="gap-3">
              {exampleUrls.map((exampleUrl, index) => (
                <Field key={exampleUrl.id} orientation="horizontal">
                  <FieldLabel
                    className="sr-only"
                    htmlFor={`${formId}-example-url-${exampleUrl.id}`}
                  >
                    Example URL {index + 1}
                  </FieldLabel>
                  <Input
                    id={`${formId}-example-url-${exampleUrl.id}`}
                    name={`exampleUrl-${exampleUrl.id}`}
                    type="url"
                    placeholder={`https://example.com/example-${index + 1}`}
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove example URL ${index + 1}`}
                    disabled={exampleUrls.length <= MIN_EXAMPLE_URLS}
                    onClick={() => removeExampleUrl(exampleUrl.id)}
                  >
                    <Trash2Icon />
                  </Button>
                </Field>
              ))}
            </FieldGroup>
          </FieldSet>

          <FieldSet>
            <FieldLegend>Fields to Extract</FieldLegend>
            <div className="-mt-2 flex items-start justify-between gap-4">
              <FieldDescription>
                Add 1–10 fields. Exactly one required field is the primary
                identifier.
              </FieldDescription>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={fields.length >= MAX_FIELDS}
                onClick={addField}
              >
                <PlusIcon />
                Add Field
              </Button>
            </div>

            <RadioGroup
              className="gap-4"
              disabled={isMutating}
              value={String(
                fields.find((field) => field.primaryIdentifier)?.id ?? "",
              )}
              onValueChange={(value) => selectPrimaryIdentifier(Number(value))}
            >
              {fields.map((field, index) => (
                <div
                  key={field.id}
                  className="space-y-4 rounded-lg border bg-muted/20 p-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <p className="font-medium">Field {index + 1}</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove field ${index + 1}`}
                      disabled={fields.length <= MIN_FIELDS}
                      onClick={() => removeField(field.id)}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor={`${formId}-field-${field.id}-label`}>
                        Label
                      </FieldLabel>
                      <Input
                        id={`${formId}-field-${field.id}-label`}
                        name={`field-${field.id}-label`}
                        minLength={2}
                        maxLength={30}
                        required
                      />
                    </Field>

                    <Field>
                      <FieldLabel
                        htmlFor={`${formId}-field-${field.id}-description`}
                      >
                        Description
                      </FieldLabel>
                      <Input
                        id={`${formId}-field-${field.id}-description`}
                        name={`field-${field.id}-description`}
                        minLength={2}
                        maxLength={100}
                        required
                      />
                    </Field>
                  </div>

                  <div className="flex flex-wrap gap-x-6 gap-y-3">
                    <Field orientation="horizontal" className="w-auto">
                      <Checkbox
                        id={`${formId}-field-${field.id}-required`}
                        checked={field.required}
                        disabled={field.primaryIdentifier}
                        onCheckedChange={(checked) =>
                          updateRequired(field.id, checked)
                        }
                      />
                      <FieldLabel
                        htmlFor={`${formId}-field-${field.id}-required`}
                      >
                        Required?
                      </FieldLabel>
                    </Field>

                    <Field orientation="horizontal" className="w-auto">
                      <RadioGroupItem
                        id={`${formId}-field-${field.id}-primary`}
                        value={String(field.id)}
                      />
                      <FieldLabel
                        htmlFor={`${formId}-field-${field.id}-primary`}
                      >
                        Primary Identifier?
                      </FieldLabel>
                    </Field>
                  </div>
                </div>
              ))}
            </RadioGroup>
          </FieldSet>
        </div>

        <DialogFooter>
          {hasActiveRun && (
            <p className="mr-auto self-center text-sm text-muted-foreground">
              Another Scrape Run is active. Wait for it to finish before
              creating a new one.
            </p>
          )}
          <Button type="submit" disabled={isMutating || hasActiveRun}>
            {isMutating && <Spinner />}
            {isMutating ? "Creating…" : "Create Scrape Run"}
          </Button>
        </DialogFooter>
      </fieldset>
    </form>
  )
}

type NewScrapeRunDialogProps = {
  hasActiveRun: boolean
  isMutating: boolean
  onCreate: (input: NewScrapeRunInput) => Promise<unknown>
}

export function NewScrapeRunDialog({
  hasActiveRun,
  isMutating,
  onCreate,
}: NewScrapeRunDialogProps) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog
      open={open}
      disablePointerDismissal={isMutating}
      onOpenChange={(nextOpen, eventDetails) => {
        if (!nextOpen && isMutating) {
          eventDetails.cancel()
          return
        }

        setOpen(nextOpen)
      }}
    >
      <Tooltip>
        <TooltipTrigger
          disabled={!hasActiveRun}
          render={
            <span
              className="inline-flex"
              tabIndex={hasActiveRun ? 0 : -1}
            />
          }
        >
          <DialogTrigger render={<Button disabled={hasActiveRun} />}>
            <PlusIcon />
            Create New Scrape Run
          </DialogTrigger>
        </TooltipTrigger>
        {hasActiveRun && (
          <TooltipContent>
            Only one Scrape Run may be active at a time.
          </TooltipContent>
        )}
      </Tooltip>
      {open && (
        <DialogContent
          className="max-h-[calc(100svh-2rem)] grid-rows-[auto_minmax(0,1fr)] sm:max-w-2xl"
          closeButtonDisabled={isMutating}
        >
          <DialogHeader>
            <DialogTitle>New Scrape Run</DialogTitle>
            <DialogDescription>
              Configure the pages and fields for this scrape run.
            </DialogDescription>
          </DialogHeader>
          <NewScrapeRunForm
            hasActiveRun={hasActiveRun}
            isMutating={isMutating}
            onCreate={onCreate}
            onSuccess={() => setOpen(false)}
          />
        </DialogContent>
      )}
    </Dialog>
  )
}
